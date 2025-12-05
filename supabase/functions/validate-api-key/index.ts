import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const validateSchema = z.object({
  keyName: z.string().min(1),
  keyValue: z.string().min(1),
});

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', valid: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decode JWT (verify_jwt=true already validated)
    const token = authHeader.replace('Bearer ', '').trim();
    let userId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1] || ''));
      userId = payload.sub || null;
    } catch (_) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', valid: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', valid: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify admin role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    const isAdmin = roles?.some(r => r.role === 'admin');
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestData = await req.json();
    const { keyName, keyValue } = validateSchema.parse(requestData);

    let isValid = false;
    let errorMessage = '';
    let serviceName = keyName;

    // Perform validation based on the key type
    try {
      if (keyName === 'OPENAI_API_KEY') {
        serviceName = 'OpenAI';
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${keyValue}` }
        });
        isValid = response.ok;
        if (!isValid) {
          errorMessage = `Invalid OpenAI API key (${response.status})`;
        }
      } else if (keyName === 'RESEND_API_KEY') {
        serviceName = 'Resend';
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${keyValue}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'test@test.com',
            to: 'test@test.com',
            subject: 'Validation Test',
            html: 'Test'
          })
        });
        // Resend returns 422 for validation test, which means API key is valid
        isValid = response.status === 422 || response.ok;
        if (!isValid) {
          errorMessage = `Invalid Resend API key (${response.status})`;
        }
      } else if (keyName === 'LOVABLE_API_KEY') {
        serviceName = 'Lovable AI';
        const response = await fetch('https://ai.gateway.lovable.dev/v1/models', {
          headers: { 'Authorization': `Bearer ${keyValue}` }
        });
        isValid = response.ok;
        if (!isValid) {
          errorMessage = `Invalid Lovable AI key (${response.status})`;
        }
      } else if (keyName.includes('GOOGLE_CALENDAR')) {
        serviceName = 'Google Calendar';
        // Google OAuth credentials cannot be easily validated without full OAuth flow
        // Just check format
        isValid = keyValue.length > 10;
        if (!isValid) {
          errorMessage = 'Invalid format for Google Calendar credentials';
        }
      } else if (keyName === 'RESEND_FROM') {
        serviceName = 'Resend';
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        isValid = emailRegex.test(keyValue);
        if (!isValid) {
          errorMessage = 'Invalid email format';
        }
      } else {
        // Generic validation - check if it's not empty and has reasonable length
        isValid = keyValue.length >= 10;
        if (!isValid) {
          errorMessage = 'Key appears too short to be valid';
        }
      }
    } catch (error: any) {
      isValid = false;
      errorMessage = error.message || 'Validation failed';
    }

    // Log the validation attempt (non-blocking)
    try {
      await supabaseAdmin.from('api_key_audit_logs').insert({
        user_id: userId,
        action: 'validated',
        key_name: keyName,
        service_name: serviceName,
        result: isValid ? 'success' : 'failed',
        error_message: errorMessage || null,
        ip_address: req.headers.get('x-forwarded-for')?.split(',')[0] || null,
        user_agent: req.headers.get('user-agent')
      });
    } catch (auditError) {
      // Log error but don't fail the request
      console.error('Failed to log audit event:', auditError);
    }

    return new Response(
      JSON.stringify({ 
        valid: isValid,
        message: isValid ? 'API key is valid' : errorMessage
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error: any) {
    console.error('Error in validate-api-key:', error);
    return new Response(
      JSON.stringify({ error: error.message, valid: false }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
};

serve(handler);
