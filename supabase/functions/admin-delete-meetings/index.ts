import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { corsHeaders } from '../_shared/cors.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

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

    // Check if super admin (only super admin can permanently delete)
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .single();

    const isSuperAdmin = profile?.email === 'mnunes.maciel@gmail.com';

    // Validate input parameters
    const deleteMeetingsSchema = z.object({
      scope: z.enum(['user', 'global', 'specific']).default('global'),
      target_user_id: z.string().uuid().optional(),
      meeting_ids: z.array(z.string().uuid()).optional(),
    }).refine(data => {
      // If scope is 'user', require target_user_id
      if (data.scope === 'user' && !data.target_user_id) {
        return false;
      }
      // If scope is 'specific', require meeting_ids
      if (data.scope === 'specific' && (!data.meeting_ids || data.meeting_ids.length === 0)) {
        return false;
      }
      return true;
    }, {
      message: "target_user_id required when scope is 'user', meeting_ids required when scope is 'specific'"
    });

    const requestData = await req.json();
    
    // If meeting_ids is provided, default to 'specific' scope
    if (requestData.meeting_ids && !requestData.scope) {
      requestData.scope = 'specific';
    }
    
    const validation = deleteMeetingsSchema.safeParse(requestData);

    if (!validation.success) {
      console.error('Validation error:', validation.error);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input parameters',
          details: validation.error.issues 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { target_user_id, scope, meeting_ids } = validation.data;

    // Only super admin can permanently delete
    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: 'Only super admin can permanently delete meetings' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting: Maximum 10 deletions per day for specific, 5 for global
    const maxDeletions = scope === 'specific' ? 10 : 5;
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentDeletions } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('action', 'admin_delete_meetings')
      .gte('created_at', oneDayAgo);

    if (recentDeletions && recentDeletions >= maxDeletions) {
      console.log(`[Rate Limit] Delete meetings blocked for user ${user.id}: ${recentDeletions} attempts in last 24h`);
      return new Response(
        JSON.stringify({ 
          error: `Rate limit exceeded: Maximum ${maxDeletions} meeting deletions per day`,
          limit: maxDeletions,
          window: '24 hours',
          current_count: recentDeletions
        }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    let query = supabase.from('meeting_notes').delete();
    let deletedCount = 0;

    if (scope === 'specific' && meeting_ids) {
      query = query.in('id', meeting_ids);
      deletedCount = meeting_ids.length;
    } else if (scope === 'user' && target_user_id) {
      query = query.eq('user_id', target_user_id);
    } else {
      // Delete all meetings (global)
      query = query.neq('id', '00000000-0000-0000-0000-000000000000');
    }

    const { error, count } = await query;

    if (error) throw error;

    // Log the rate limit
    await supabase.from('rate_limits').insert({
      user_id: user.id,
      action: 'admin_delete_meetings'
    });

    // Log the action
    await supabase.rpc('log_audit_event', {
      _action: 'admin_delete_meetings',
      _resource_type: 'meeting_notes',
      _metadata: { scope, target_user_id, meeting_ids, deleted_count: count || deletedCount }
    });

    console.log(`[Admin] Meetings deleted by ${profile?.email}: scope=${scope}, count=${count || deletedCount}`);

    return new Response(
      JSON.stringify({ success: true, deleted_count: count || deletedCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error deleting meetings:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});