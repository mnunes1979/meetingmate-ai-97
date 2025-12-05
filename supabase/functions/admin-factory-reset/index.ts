import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    // Rate limiting: Maximum 1 factory reset per day (most restrictive)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentResets } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('action', 'admin_factory_reset')
      .gte('created_at', oneDayAgo);

    if (recentResets && recentResets >= 1) {
      console.log(`[Rate Limit] Factory reset blocked for user ${user.id}: ${recentResets} attempts in last 24h`);
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded: Maximum 1 factory reset per day',
          limit: 1,
          window: '24 hours',
          current_count: recentResets
        }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const results = {
      meetings_deleted: 0,
      departments_deleted: 0,
      users_deleted: 0,
    };

    // 1. Delete all meetings
    const { count: meetingsCount } = await supabase
      .from('meeting_notes')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    results.meetings_deleted = meetingsCount || 0;

    // 2. Delete all department emails
    await supabase
      .from('department_emails')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    // 3. Delete all departments
    const { count: deptCount } = await supabase
      .from('departments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    results.departments_deleted = deptCount || 0;

    // 4. Delete all non-admin users
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    const adminUserIds = adminRoles?.map(r => r.user_id) || [];

    const { data: { users } } = await supabase.auth.admin.listUsers();

    for (const targetUser of users) {
      if (!adminUserIds.includes(targetUser.id)) {
        const { error } = await supabase.auth.admin.deleteUser(targetUser.id);
        if (!error) {
          results.users_deleted++;
        }
      }
    }

    // Log the rate limit
    await supabase.from('rate_limits').insert({
      user_id: user.id,
      action: 'admin_factory_reset'
    });

    // Log the action
    await supabase.rpc('log_audit_event', {
      _action: 'admin_factory_reset',
      _resource_type: 'system',
      _metadata: results
    });

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error performing factory reset:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});