import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { corsHeaders } from '../_shared/cors.ts';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const manageRoleSchema = z.object({
  user_id: z.string().uuid(),
  action: z.enum(['promote', 'demote']),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get the requesting user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is admin
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting check
    const { data: recentActions } = await supabase
      .from('rate_limits')
      .select('id')
      .eq('user_id', user.id)
      .eq('action', 'admin_manage_role')
      .gte('created_at', new Date(Date.now() - 60000).toISOString());

    if (recentActions && recentActions.length >= 10) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Maximum 10 role changes per minute.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestData = await req.json();
    const { user_id, action } = manageRoleSchema.parse(requestData);

    // Log rate limit
    await supabase.from('rate_limits').insert({
      user_id: user.id,
      action: 'admin_manage_role',
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0] || null,
    });

    if (action === 'promote') {
      // Add admin role
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id, role: 'admin' });

      if (error && !error.message.includes('duplicate')) {
        throw error;
      }
    } else {
      // Remove admin role
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', user_id)
        .eq('role', 'admin');

      if (error) throw error;
    }

    // Log the action
    await supabase.rpc('log_audit_event', {
      _action: `admin_role_${action}`,
      _resource_type: 'user_roles',
      _resource_id: user_id,
      _metadata: { action }
    });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error managing role:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});