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

    const requestData = await req.json();
    const { keyName, keyValue, action } = updateSchema.parse(requestData);

    // Get the key from database
    const { data: existingKey } = await supabaseAdmin
      .from('api_keys_config')
      .select('id, service_name')
      .eq('key_name', keyName)
      .single();

    if (action === 'delete') {
      if (!existingKey) {
        return new Response(
          JSON.stringify({ error: 'Chave não encontrada' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Set key_value to empty string (we keep the row for structure)
      const { error: updateError } = await supabaseAdmin
        .from('api_keys_config')
        .update({ 
          key_value: '',
          updated_at: new Date().toISOString(),
          updated_by: userId
        })
        .eq('key_name', keyName);

      if (updateError) {
        console.error('Error clearing key:', updateError);
        throw new Error('Falha ao apagar API key');
      }

      // API key cleared
    } else {
      // Update action
      if (!keyValue) {
        return new Response(
          JSON.stringify({ error: 'Valor da chave é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (existingKey) {
        // Update existing key
        const { error: updateError } = await supabaseAdmin
          .from('api_keys_config')
          .update({ 
            key_value: keyValue,
            updated_at: new Date().toISOString(),
            updated_by: userId
          })
          .eq('key_name', keyName);

        if (updateError) {
          console.error('Error updating key:', updateError);
          throw new Error('Falha ao atualizar API key');
        }
      } else {
        // Insert new key
        const { error: insertError } = await supabaseAdmin
          .from('api_keys_config')
          .insert({
            key_name: keyName,
            key_value: keyValue,
            service_name: keyName.split('_')[0],
            description: `Configurado por ${userEmail || userId}`,
            category: keyName.includes('OPENAI') ? 'AI Services' : 'Email Services',
            created_by: userId,
            updated_by: userId
          });

        if (insertError) {
          console.error('Error inserting key:', insertError);
          throw new Error('Falha ao criar API key');
        }
      }

      // API key updated
    }

    // Determine service name for audit
    let serviceName = existingKey?.service_name || keyName;
    if (keyName.includes('OPENAI')) serviceName = 'OpenAI';
    else if (keyName.includes('RESEND')) serviceName = 'Resend';

    // Log the action
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
    } catch (auditError) {
      console.error('Failed to log audit event:', auditError);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in update-api-key:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
