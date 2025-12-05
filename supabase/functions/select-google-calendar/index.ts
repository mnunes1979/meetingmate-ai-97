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
    console.log('[select-google-calendar] Starting');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { calendarId, calendarSummary, calendarTimeZone } = await req.json();

    if (!calendarId || !calendarSummary) {
      throw new Error('Missing required fields');
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
      console.error('[select-google-calendar] User error:', userError);
      throw new Error('Unauthorized');
    }

    // Update profile with selected calendar
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        google_calendar_id: calendarId,
        google_calendar_summary: calendarSummary,
        google_calendar_timezone: calendarTimeZone || 'Europe/Lisbon',
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[select-google-calendar] Update error:', updateError);
      throw new Error('Failed to update calendar selection');
    }

    console.log('[select-google-calendar] Calendar selected:', calendarId);

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[select-google-calendar] Error:', error);
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
