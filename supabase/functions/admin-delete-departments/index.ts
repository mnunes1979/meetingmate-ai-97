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

    // Rate limiting: Maximum 5 deletions per day
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentDeletions } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('action', 'admin_delete_departments')
      .gte('created_at', oneDayAgo);

    if (recentDeletions && recentDeletions >= 5) {
      console.log(`[Rate Limit] Delete departments blocked for user ${user.id}: ${recentDeletions} attempts in last 24h`);
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded: Maximum 5 department deletions per day',
          limit: 5,
          window: '24 hours',
          current_count: recentDeletions
        }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Delete all department emails first (due to foreign key)
    const { error: emailsError } = await supabase
      .from('department_emails')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (emailsError) throw emailsError;

    // Delete all departments
    const { error: deptError, count } = await supabase
      .from('departments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deptError) throw deptError;

    // Log the rate limit
    await supabase.from('rate_limits').insert({
      user_id: user.id,
      action: 'admin_delete_departments'
    });

    // Log the action
    await supabase.rpc('log_audit_event', {
      _action: 'admin_delete_all_departments',
      _resource_type: 'departments',
      _metadata: { deleted_count: count || 0 }
    });

    return new Response(
      JSON.stringify({ success: true, deleted_count: count || 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error deleting departments:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});