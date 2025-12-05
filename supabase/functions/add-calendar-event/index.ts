import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const addEventSchema = z.object({
  calendarId: z.string().optional(),
  summary: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  attendees: z.array(z.object({
    email: z.string().email(),
    displayName: z.string().max(100).optional(),
  })).max(50).optional(),
}).refine(data => {
  const start = new Date(data.startTime);
  const end = new Date(data.endTime);
  const now = new Date();
  const fiveYearsFromNow = new Date(now.getFullYear() + 5, now.getMonth(), now.getDate());
  
  return start < end && start < fiveYearsFromNow;
}, {
  message: "Start time must be before end time and within 5 years"
});

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limiting
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('action', 'calendar_event')
      .gte('created_at', oneDayAgo);

    if (count && count >= 30) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Maximum 30 calendar events per day.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate input
    const requestData = await req.json();
    const { 
      calendarId, 
      summary, 
      description, 
      startTime, 
      endTime, 
      attendees
    } = addEventSchema.parse(requestData);

    console.log('Adding calendar event for user:', user.id);

    // Get user's Google Calendar configuration and access token securely
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('google_calendar_id, google_access_token, google_token_expires_at, google_refresh_token')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('User profile not found');
    }

    if (!profile.google_access_token) {
      return new Response(
        JSON.stringify({ error: 'Google Calendar not connected', success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let accessToken = profile.google_access_token;

    // Check if token is expired and refresh if needed
    if (profile.google_token_expires_at) {
      const expiresAt = new Date(profile.google_token_expires_at);
      if (expiresAt < new Date()) {
        console.log('Token expired, refreshing...');
        
        if (!profile.google_refresh_token) {
          return new Response(
            JSON.stringify({ error: 'Cannot refresh token. Please reconnect Google Calendar.', success: false }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Refresh the token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID')!,
            client_secret: Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET')!,
            refresh_token: profile.google_refresh_token,
            grant_type: 'refresh_token',
          }),
        });

        if (!tokenResponse.ok) {
          console.error('Token refresh failed:', await tokenResponse.text());
          return new Response(
            JSON.stringify({ error: 'Failed to refresh token. Please reconnect Google Calendar.', success: false }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const tokenData = await tokenResponse.json();
        accessToken = tokenData.access_token;

        // Update token in database
        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
        await supabaseAdmin
          .from('profiles')
          .update({
            google_access_token: accessToken,
            google_token_expires_at: expiresAt.toISOString(),
          })
          .eq('id', user.id);

        console.log('Token refreshed successfully');
      }
    }

    const targetCalendarId = calendarId || profile.google_calendar_id || 'primary';

    const event = {
      summary,
      description,
      start: {
        dateTime: startTime,
        timeZone: 'Europe/Lisbon',
      },
      end: {
        dateTime: endTime,
        timeZone: 'Europe/Lisbon',
      },
      attendees: attendees?.map(a => ({ email: a.email, displayName: a.displayName })),
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    };

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendarId)}/events`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Google Calendar API error:', errorData);
      throw new Error('Unable to add calendar event. Please try again.');
    }

    const createdEvent = await response.json();

    // Log rate limit
    await supabaseAdmin.from('rate_limits').insert({
      user_id: user.id,
      action: 'calendar_event',
    });

    return new Response(
      JSON.stringify({
        success: true,
        eventId: createdEvent.id,
        htmlLink: createdEvent.htmlLink,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.errors);
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: error.errors, success: false }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    console.error("Erro ao adicionar evento ao calendário:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
