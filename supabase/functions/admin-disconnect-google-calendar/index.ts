import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const disconnectSchema = z.object({
  userId: z.string().uuid(),
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

    // Verify admin role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate input
    const requestData = await req.json();
    const { userId } = disconnectSchema.parse(requestData);

    console.log('[admin-disconnect-google-calendar] Disconnecting for user:', userId);

    // Get user profile to revoke token on Google's side
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('google_access_token, email')
      .eq('id', userId)
      .single();

    // Revoke token on Google's side (best effort)
    if (profile?.google_access_token) {
      try {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${profile.google_access_token}`,
          { method: 'POST' }
        );
        console.log('[admin-disconnect-google-calendar] Token revoked on Google');
      } catch (revokeError) {
        console.error('[admin-disconnect-google-calendar] Revoke error:', revokeError);
        // Continue anyway to clear local data
      }
    }

    // Clear all Google Calendar data from profile (using service role)
    const { error: updateError } = await supabaseAdmin
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
      .eq('id', userId);

    if (updateError) {
      console.error('[admin-disconnect-google-calendar] Update error:', updateError);
      throw new Error('Failed to disconnect calendar');
    }

    // Log audit event
    await supabaseAdmin.from('audit_logs').insert({
      user_id: user.id,
      action: 'admin_disconnect_google_calendar',
      resource_type: 'profiles',
      resource_id: userId,
      metadata: {
        target_user_email: profile?.email,
        disconnected_by_admin: user.email,
      },
    });

    console.log('[admin-disconnect-google-calendar] Successfully disconnected');

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.errors);
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: error.errors }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    console.error("[admin-disconnect-google-calendar] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);
