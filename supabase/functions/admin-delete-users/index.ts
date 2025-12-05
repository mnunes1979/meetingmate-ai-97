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

    // Rate limiting: Maximum 3 deletions per day
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentDeletions } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('action', 'admin_delete_users')
      .gte('created_at', oneDayAgo);

    if (recentDeletions && recentDeletions >= 3) {
      console.log(`[Rate Limit] Delete users blocked for user ${user.id}: ${recentDeletions} attempts in last 24h`);
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded: Maximum 3 user deletions per day',
          limit: 3,
          window: '24 hours',
          current_count: recentDeletions
        }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get all admin user IDs
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    const adminUserIds = adminRoles?.map(r => r.user_id) || [];

    // Get all users
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      throw listError;
    }

    // Delete non-admin users
    let deletedCount = 0;
    for (const targetUser of users) {
      if (!adminUserIds.includes(targetUser.id)) {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(targetUser.id);
        if (!deleteError) {
          deletedCount++;
        }
      }
    }

    // Log the rate limit
    await supabase.from('rate_limits').insert({
      user_id: user.id,
      action: 'admin_delete_users'
    });

    // Log the action
    await supabase.rpc('log_audit_event', {
      _action: 'admin_delete_users',
      _resource_type: 'users',
      _metadata: { deleted_count: deletedCount }
    });

    return new Response(
      JSON.stringify({ success: true, deleted_count: deletedCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error deleting users:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});