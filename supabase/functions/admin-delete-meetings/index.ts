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

    // Rate limiting: Maximum 5 deletions per day
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentDeletions } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('action', 'admin_delete_meetings')
      .gte('created_at', oneDayAgo);

    if (recentDeletions && recentDeletions >= 5) {
      console.log(`[Rate Limit] Delete meetings blocked for user ${user.id}: ${recentDeletions} attempts in last 24h`);
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded: Maximum 5 meeting deletions per day',
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

    // Validate input parameters
    const deleteMeetingsSchema = z.object({
      scope: z.enum(['user', 'global']).default('global'),
      target_user_id: z.string().uuid().optional(),
    }).refine(data => {
      // If scope is 'user', require target_user_id
      if (data.scope === 'user' && !data.target_user_id) {
        return false;
      }
      return true;
    }, {
      message: "target_user_id required when scope is 'user'"
    });

    const requestData = await req.json();
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

    const { target_user_id, scope } = validation.data;

    let query = supabase.from('meeting_notes').delete();

    if (scope === 'user' && target_user_id) {
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
      _metadata: { scope, target_user_id, deleted_count: count || 0 }
    });

    return new Response(
      JSON.stringify({ success: true, deleted_count: count || 0 }),
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