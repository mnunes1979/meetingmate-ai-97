import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Define known API keys and their metadata
const API_KEYS_REGISTRY = [
  {
    name: "OPENAI_API_KEY",
    service: "OpenAI",
    description: "Chave API OpenAI para transcrição e análise de reuniões",
    validationEndpoint: "https://api.openai.com/v1/models",
    category: "AI Services"
  },
  {
    name: "RESEND_API_KEY",
    service: "Resend",
    description: "Chave API Resend para envio de emails",
    validationEndpoint: "https://api.resend.com/emails",
    category: "Email Services"
  },
  {
    name: "RESEND_FROM",
    service: "Resend",
    description: "Email de remetente padrão para Resend",
    validationEndpoint: null,
    category: "Email Services"
  },
  {
    name: "RESEND_WEBHOOK_SECRET",
    service: "Resend",
    description: "Webhook secret para validação de eventos Resend",
    validationEndpoint: null,
    category: "Email Services"
  }
];

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

    // Decode JWT from header (verify_jwt=true already validated the token)
    const token = authHeader.replace('Bearer ', '').trim();
    let userId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1] || ''));
      userId = payload.sub || null;
    } catch (_) {
      // If decoding fails, treat as unauthorized
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

    // Get all API keys with masked values
    const apiKeysInfo = API_KEYS_REGISTRY.map(keyConfig => {
      const value = Deno.env.get(keyConfig.name);
      const exists = !!value;
      
      let maskedValue = '';
      if (value) {
        // Show only last 4 characters
        const visibleChars = 4;
        if (value.length > visibleChars) {
          maskedValue = '*'.repeat(Math.max(8, value.length - visibleChars)) + value.slice(-visibleChars);
        } else {
          maskedValue = '*'.repeat(8);
        }
      }

      return {
        name: keyConfig.name,
        service: keyConfig.service,
        description: keyConfig.description,
        category: keyConfig.category,
        exists,
        maskedValue: exists ? maskedValue : 'Não configurado',
        canValidate: !!keyConfig.validationEndpoint,
        readonly: false
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
      // Log error but don't fail the request
      console.error('Failed to log audit event:', auditError);
    }

    return new Response(
      JSON.stringify({ apiKeys: apiKeysInfo }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error: any) {
    console.error('Error in get-api-keys-info:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
};

serve(handler);
