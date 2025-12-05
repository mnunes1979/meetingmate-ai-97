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
    console.log('[list-calendar-events] Starting');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { timeMin, timeMax, maxResults } = await req.json();

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
      console.error('[list-calendar-events] User error:', userError);
      throw new Error('Unauthorized');
    }

    // Get user profile with Google tokens
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('google_access_token, google_refresh_token, google_token_expires_at, google_calendar_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.google_access_token) {
      console.error('[list-calendar-events] Profile error:', profileError);
      throw new Error('Google Calendar not connected');
    }

    if (!profile.google_calendar_id) {
      throw new Error('No calendar selected');
    }

    // Check if token needs refresh
    let accessToken = profile.google_access_token;
    if (profile.google_token_expires_at) {
      const expiresAt = new Date(profile.google_token_expires_at);
      if (expiresAt < new Date()) {
        console.log('[list-calendar-events] Token expired, refreshing');
        
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

    // Build query params
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: (maxResults || 50).toString(),
    });

    if (timeMin) params.set('timeMin', timeMin);
    if (timeMax) params.set('timeMax', timeMax);

    // List events from Google Calendar
    console.log('[list-calendar-events] Fetching events from calendar:', profile.google_calendar_id);
    const eventsResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(profile.google_calendar_id)}/events?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!eventsResponse.ok) {
      const errorText = await eventsResponse.text();
      console.error('[list-calendar-events] Google API error:', errorText);
      throw new Error('Failed to fetch events from Google');
    }

    const eventsData = await eventsResponse.json();
    
    console.log('[list-calendar-events] Found', eventsData.items?.length || 0, 'events');

    return new Response(
      JSON.stringify({ events: eventsData.items || [] }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[list-calendar-events] Error:', error);
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
