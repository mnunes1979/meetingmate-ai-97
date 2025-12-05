import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const toggleUserSchema = z.object({
  userId: z.string().uuid(),
  active: z.boolean(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is admin
    const { data: isAdmin } = await supabaseAdmin
      .rpc('has_role', { _user_id: user.id, _role: 'admin' });

    if (!isAdmin) {
      throw new Error('Only admins can toggle user status');
    }

    // Rate limiting check
    const { data: recentActions } = await supabaseAdmin
      .from('rate_limits')
      .select('id')
      .eq('user_id', user.id)
      .eq('action', 'admin_toggle_user')
      .gte('created_at', new Date(Date.now() - 60000).toISOString());

    if (recentActions && recentActions.length >= 20) {
      throw new Error('Rate limit exceeded. Maximum 20 user toggles per minute.');
    }

    const requestData = await req.json();
    const { userId, active } = toggleUserSchema.parse(requestData);

    // Log rate limit
    await supabaseAdmin.from('rate_limits').insert({
      user_id: user.id,
      action: 'admin_toggle_user',
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0] || null,
    });

    // Update profile active status
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ active })
      .eq('id', userId);

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({ success: true }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});