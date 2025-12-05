import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();
    let userId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1] || ''));
      userId = payload.sub || null;
    } catch (_) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check admin role
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

    // Fetch API keys from database
    const { data: apiKeysData, error: dbError } = await supabaseAdmin
      .from('api_keys_config')
      .select('*')
      .order('category', { ascending: true })
      .order('service_name', { ascending: true });

    if (dbError) {
      console.error('Error fetching API keys:', dbError);
      throw new Error('Failed to load API keys');
    }

    // Transform data for frontend
    const apiKeys = (apiKeysData || []).map(key => {
      const hasValue = key.key_value && key.key_value.length > 0;
      let maskedValue = '(não configurado)';
      
      if (hasValue) {
        const visibleChars = 4;
        if (key.key_value.length > visibleChars) {
          maskedValue = '*'.repeat(Math.max(8, key.key_value.length - visibleChars)) + key.key_value.slice(-visibleChars);
        } else {
          maskedValue = '*'.repeat(8);
        }
      }

      return {
        id: key.id,
        name: key.key_name,
        service: key.service_name,
        description: key.description || '',
        category: key.category,
        exists: hasValue,
        maskedValue,
        canValidate: key.key_name === 'OPENAI_API_KEY' || key.key_name === 'RESEND_API_KEY',
        readonly: false,
      };
    });

    // Log the viewing action (non-blocking)
    try {
      await supabaseAdmin.from('api_key_audit_logs').insert({
        user_id: userId,
        action: 'viewed',
        key_name: 'all_keys',
        service_name: 'API Keys Manager',
        result: 'success',
        ip_address: req.headers.get('x-forwarded-for')?.split(',')[0] || null,
        user_agent: req.headers.get('user-agent')
      });
    } catch (auditError) {
      console.error('Failed to log audit event:', auditError);
    }

    return new Response(
      JSON.stringify({ apiKeys }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in get-api-keys-info:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
