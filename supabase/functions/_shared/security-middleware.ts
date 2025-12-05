// Shared security middleware for edge functions
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  'Access-Control-Max-Age': '86400',
};

export const securityHeaders = {
  ...corsHeaders,
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  // Enable XSS protection
  'X-XSS-Protection': '1; mode=block',
  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Content Security Policy
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://*.lovable.app",
  // Permissions policy
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

interface SecurityCheckOptions {
  requireAuth?: boolean;
  requireAdmin?: boolean;
  logAction?: string;
  logResourceType?: string;
}

interface SecurityCheckResult {
  success: boolean;
  user?: any;
  error?: Response;
}

/**
 * Validates authentication and checks security requirements
 */
export async function securityCheck(
  req: Request,
  options: SecurityCheckOptions = {}
): Promise<SecurityCheckResult> {
  const { requireAuth = true, requireAdmin = false, logAction, logResourceType } = options;

  // Handle OPTIONS requests
  if (req.method === 'OPTIONS') {
    return {
      success: false,
      error: new Response(null, { headers: securityHeaders }),
    };
  }

  if (!requireAuth) {
    return { success: true };
  }

  // Check authorization header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return {
      success: false,
      error: new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { 
          status: 401, 
          headers: { ...securityHeaders, 'Content-Type': 'application/json' } 
        }
      ),
    };
  }

  // Create Supabase client
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  );

  // Verify user
  const token = authHeader.replace('Bearer', '').trim();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  
  if (authError || !user) {
    return {
      success: false,
      error: new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...securityHeaders, 'Content-Type': 'application/json' } 
        }
      ),
    };
  }

  // Check admin requirement
  if (requireAdmin) {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roles) {
      return {
        success: false,
        error: new Response(
          JSON.stringify({ error: 'Admin access required' }),
          { 
            status: 403, 
            headers: { ...securityHeaders, 'Content-Type': 'application/json' } 
          }
        ),
      };
    }
  }

  // Log action if requested
  if (logAction && logResourceType) {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    try {
      await supabaseAdmin.from('audit_logs').insert({
        user_id: user.id,
        action: logAction,
        resource_type: logResourceType,
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        user_agent: req.headers.get('user-agent'),
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }

  return { success: true, user };
}

interface RateLimitOptions {
  action: string;
  maxRequests: number;
  windowMinutes: number;
  userId: string;
  ipAddress?: string;
}

/**
 * Checks rate limiting for a specific action
 */
export async function checkRateLimit(
  options: RateLimitOptions
): Promise<{ allowed: boolean; error?: Response }> {
  const { action, maxRequests, windowMinutes, userId, ipAddress } = options;

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  
  let query = supabaseAdmin
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', action)
    .gte('created_at', windowStart);

  // Also check by IP if provided
  if (ipAddress) {
    query = query.or(`ip_address.eq.${ipAddress}`);
  }

  const { count } = await query;

  if (count && count >= maxRequests) {
    return {
      allowed: false,
      error: new Response(
        JSON.stringify({ 
          error: `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMinutes} minutes.`,
          retryAfter: windowMinutes * 60 
        }),
        { 
          status: 429, 
          headers: { 
            ...securityHeaders, 
            'Content-Type': 'application/json',
            'Retry-After': String(windowMinutes * 60)
          } 
        }
      ),
    };
  }

  // Log the rate limit check
  await supabaseAdmin.from('rate_limits').insert({
    user_id: userId,
    action,
    ip_address: ipAddress,
  });

  return { allowed: true };
}

/**
 * Sanitizes input to prevent injection attacks
 */
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove potentially dangerous characters
    return input
      .replace(/[<>]/g, '')
      .trim()
      .substring(0, 10000); // Max length
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  return input;
}

/**
 * Creates a standardized error response
 */
export function errorResponse(
  message: string,
  status: number = 500,
  details?: any
): Response {
  const errorPayload: any = { 
    error: message,
    timestamp: new Date().toISOString()
  };
  
  if (details && Deno.env.get('ENVIRONMENT') === 'development') {
    errorPayload.details = details;
  }

  return new Response(
    JSON.stringify(errorPayload),
    { 
      status, 
      headers: { ...securityHeaders, 'Content-Type': 'application/json' } 
    }
  );
}

/**
 * Creates a standardized success response
 */
export function successResponse(data: any, status: number = 200): Response {
  return new Response(
    JSON.stringify({
      ...data,
      timestamp: new Date().toISOString()
    }),
    { 
      status, 
      headers: { ...securityHeaders, 'Content-Type': 'application/json' } 
    }
  );
}
