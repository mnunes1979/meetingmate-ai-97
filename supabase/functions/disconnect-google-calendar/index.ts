import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[disconnect-google-calendar] Starting');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('[disconnect-google-calendar] User error:', userError);
      throw new Error('Unauthorized');
    }

    // Get access token to revoke
    const { data: profile } = await supabase
      .from('profiles')
      .select('google_access_token')
      .eq('id', user.id)
      .single();

    // Revoke token on Google's side (best effort)
    if (profile?.google_access_token) {
      try {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${profile.google_access_token}`,
          { method: 'POST' }
        );
        console.log('[disconnect-google-calendar] Token revoked on Google');
      } catch (revokeError) {
        console.error('[disconnect-google-calendar] Revoke error:', revokeError);
        // Continue anyway to clear local data
      }
    }

    // Clear all Google Calendar data from profile
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        google_linked: false,
        google_access_token: null,
        google_refresh_token: null,
        google_token_expires_at: null,
        google_calendar_id: null,
        google_calendar_summary: null,
        google_calendar_timezone: null,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[disconnect-google-calendar] Update error:', updateError);
      throw new Error('Failed to disconnect calendar');
    }

    console.log('[disconnect-google-calendar] Successfully disconnected');

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[disconnect-google-calendar] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
