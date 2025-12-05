import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const updateSchema = z.object({
  keyName: z.string().min(1),
  keyValue: z.string().optional(),
  action: z.enum(['update', 'delete']).default('update'),
});

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

    // Decode JWT (verify_jwt=true already validated)
    const token = authHeader.replace('Bearer ', '').trim();
    let userId: string | null = null;
    let userEmail: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1] || ''));
      userId = payload.sub || null;
      userEmail = payload.email || null;
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
    const { keyName, keyValue, action } = updateSchema.parse(requestData);

    // Check if key is readonly (only system keys)
    if (keyName.startsWith('SUPABASE_')) {
      return new Response(
        JSON.stringify({ error: 'Esta chave não pode ser modificada' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Allowed keys that can be managed
    const allowedKeys = ['OPENAI_API_KEY', 'RESEND_API_KEY', 'RESEND_FROM', 'RESEND_WEBHOOK_SECRET'];
    if (!allowedKeys.includes(keyName)) {
      return new Response(
        JSON.stringify({ error: 'Esta chave não pode ser gerida por aqui' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get project reference
    const projectRef = Deno.env.get('SUPABASE_URL')?.split('//')[1]?.split('.')[0];
    if (!projectRef) {
      throw new Error('Invalid Supabase configuration');
    }

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (action === 'delete') {
      // Delete the secret
      const deleteResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets?name=${keyName}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
      });

      if (!deleteResponse.ok) {
        const errorData = await deleteResponse.text();
        console.error('Failed to delete secret:', errorData);
        throw new Error('Falha ao apagar API key');
      }
    } else {
      // Update the secret
      if (!keyValue) {
        return new Response(
          JSON.stringify({ error: 'Valor da chave é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const updateResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{
          name: keyName,
          value: keyValue,
        }]),
      });

      if (!updateResponse.ok) {
        const errorData = await updateResponse.text();
        console.error('Failed to update secret:', errorData);
        throw new Error('Falha ao atualizar API key');
      }
    }

    // Determine service name
    let serviceName = keyName;
    if (keyName.includes('OPENAI')) serviceName = 'OpenAI';
    else if (keyName.includes('RESEND')) serviceName = 'Resend';

    // Log the action (CRITICAL SECURITY LOG - non-blocking)
    try {
      await supabaseAdmin.from('api_key_audit_logs').insert({
        user_id: userId,
        action: action === 'delete' ? 'deleted' : 'edited',
        key_name: keyName,
        service_name: serviceName,
        result: 'success',
        ip_address: req.headers.get('x-forwarded-for')?.split(',')[0] || null,
        user_agent: req.headers.get('user-agent')
      });
      
      console.log(`[SECURITY] API key ${keyName} ${action === 'delete' ? 'deleted' : 'updated'} by user ${userEmail ?? userId}`);
    } catch (auditError) {
      console.error('Failed to log audit event:', auditError);
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error: any) {
    console.error('Error in update-api-key:', error);
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
