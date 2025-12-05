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
      if (data.scope === 'user' && !data.target_user_id) return false;
      if (data.scope === 'specific' && (!data.meeting_ids || data.meeting_ids.length === 0)) return false;
      return true;
    }, {
      message: "target_user_id required when scope is 'user', meeting_ids required when scope is 'specific'"
    });

    const requestData = await req.json();
    
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
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Rate limiting
    const maxDeletions = scope === 'specific' ? 10 : 5;
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentDeletions } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('action', 'admin_delete_meetings')
      .gte('created_at', oneDayAgo);

    if (recentDeletions && recentDeletions >= maxDeletions) {
      console.log(`[Rate Limit] Delete meetings blocked for user ${user.id}`);
      return new Response(
        JSON.stringify({ 
          error: `Rate limit exceeded: Maximum ${maxDeletions} meeting deletions per day`,
          limit: maxDeletions,
          window: '24 hours',
          current_count: recentDeletions
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get meetings to delete based on scope
    let meetingsToDelete: { id: string; transcript_url: string | null; user_id: string }[] = [];
    
    if (scope === 'specific' && meeting_ids) {
      const { data } = await supabase
        .from('meeting_notes')
        .select('id, transcript_url, user_id')
        .in('id', meeting_ids);
      meetingsToDelete = data || [];
    } else if (scope === 'user' && target_user_id) {
      const { data } = await supabase
        .from('meeting_notes')
        .select('id, transcript_url, user_id')
        .eq('user_id', target_user_id);
      meetingsToDelete = data || [];
    } else {
      // Global delete
      const { data } = await supabase
        .from('meeting_notes')
        .select('id, transcript_url, user_id');
      meetingsToDelete = data || [];
    }

    console.log(`[GDPR Delete] Processing ${meetingsToDelete.length} meetings for cascade deletion`);

    let totalDeleted = 0;
    const deletionResults: any[] = [];
    const storageErrors: string[] = [];

    // Process each meeting with GDPR cascade delete
    for (const meeting of meetingsToDelete) {
      try {
        // 1. Call GDPR cascade delete function for database records
        const { data: cascadeResult, error: cascadeError } = await supabase.rpc(
          'gdpr_delete_meeting_cascade',
          { _meeting_id: meeting.id, _user_id: user.id }
        );

        if (cascadeError) {
          console.error(`[GDPR Delete] Cascade error for meeting ${meeting.id}:`, cascadeError);
          continue;
        }

        // 2. Delete audio file from storage bucket
        if (meeting.transcript_url) {
          // Extract the file path from the URL or use it directly if it's a path
          let storagePath = meeting.transcript_url;
          
          // If it's a full URL, extract the path
          if (storagePath.includes('/storage/v1/object/')) {
            const match = storagePath.match(/audio-recordings\/(.+)/);
            if (match) {
              storagePath = match[1];
            }
          }
          
          // Also try the user_id/filename format
          const possiblePaths = [
            storagePath,
            `${meeting.user_id}/${storagePath.split('/').pop()}`,
          ];

          for (const path of possiblePaths) {
            const { error: storageError } = await supabase.storage
              .from('audio-recordings')
              .remove([path]);

            if (!storageError) {
              console.log(`[GDPR Delete] Audio file deleted: ${path}`);
              break;
            } else {
              console.warn(`[GDPR Delete] Storage delete attempt failed for path ${path}:`, storageError.message);
            }
          }
        }

        totalDeleted++;
        deletionResults.push(cascadeResult);
        
      } catch (err) {
        console.error(`[GDPR Delete] Error processing meeting ${meeting.id}:`, err);
      }
    }

    // Log the rate limit
    await supabase.from('rate_limits').insert({
      user_id: user.id,
      action: 'admin_delete_meetings'
    });

    // Log comprehensive audit event
    await supabase.rpc('log_audit_event', {
      _action: 'admin_gdpr_bulk_delete',
      _resource_type: 'meeting_notes',
      _metadata: { 
        scope, 
        target_user_id, 
        meeting_ids,
        total_deleted: totalDeleted,
        storage_errors: storageErrors.length,
        deletion_results: deletionResults
      }
    });

    console.log(`[Admin GDPR Delete] Completed by ${profile?.email}: scope=${scope}, deleted=${totalDeleted}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        deleted_count: totalDeleted,
        gdpr_compliant: true,
        cascade_results: deletionResults
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in GDPR delete meetings:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});