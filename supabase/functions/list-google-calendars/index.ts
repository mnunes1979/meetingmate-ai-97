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
    console.log('[list-google-calendars] Starting');

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
      console.error('[list-google-calendars] User error:', userError);
      throw new Error('Unauthorized');
    }

    // Get user profile with Google tokens
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('google_access_token, google_refresh_token, google_token_expires_at')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.google_access_token) {
      console.error('[list-google-calendars] Profile error:', profileError);
      throw new Error('Google Calendar not connected');
    }

    // Check if token needs refresh
    let accessToken = profile.google_access_token;
    if (profile.google_token_expires_at) {
      const expiresAt = new Date(profile.google_token_expires_at);
      if (expiresAt < new Date()) {
        console.log('[list-google-calendars] Token expired, refreshing');
        
        // Refresh token
        const refreshResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/refresh-google-token`,
          {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!refreshResponse.ok) {
          throw new Error('Failed to refresh token');
        }

        const refreshData = await refreshResponse.json();
        accessToken = refreshData.access_token;
      }
    }

    // List calendars from Google
    console.log('[list-google-calendars] Fetching calendar list');
    const calendarResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!calendarResponse.ok) {
      const errorText = await calendarResponse.text();
      console.error('[list-google-calendars] Google API error:', errorText);
      throw new Error('Failed to fetch calendars from Google');
    }

    const calendarData = await calendarResponse.json();
    
    // Transform calendar data
    const calendars = calendarData.items?.map((cal: any) => ({
      id: cal.id,
      summary: cal.summary,
      primary: cal.primary || false,
      timeZone: cal.timeZone,
      backgroundColor: cal.backgroundColor,
      accessRole: cal.accessRole,
    })) || [];

    console.log('[list-google-calendars] Found', calendars.length, 'calendars');

    return new Response(
      JSON.stringify({ calendars }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[list-google-calendars] Error:', error);
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
