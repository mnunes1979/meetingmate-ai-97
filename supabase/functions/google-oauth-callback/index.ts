import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[google-oauth-callback] Starting OAuth callback processing');

    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // Check for OAuth errors
    if (error) {
      console.error('[google-oauth-callback] OAuth error:', error);
      const frontendUrl = 'https://aftermeeting.andorsoft-lab.com/settings?error=' + error;
      return Response.redirect(frontendUrl, 302);
    }

    if (!code || !state) {
      throw new Error('Missing code or state parameter');
    }

    // Parse state: format is "state|userId"
    const [stateToken, userId] = state.split('|');
    
    if (!userId || !stateToken) {
      throw new Error('Invalid state parameter');
    }

    console.log('[google-oauth-callback] Processing for user:', userId);

    // Get stored state data from database
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get OAuth state from dedicated table
    const { data: oauthState, error: stateError } = await supabaseAdmin
      .from('oauth_states')
      .select('*')
      .eq('user_id', userId)
      .eq('state_token', stateToken)
      .eq('provider', 'google')
      .single();

    if (stateError || !oauthState) {
      console.error('[google-oauth-callback] OAuth state not found:', stateError);
      throw new Error('State verification failed - no stored state found');
    }

    // Check if state is expired (database handles expiry timestamp)
    if (new Date(oauthState.expires_at) < new Date()) {
      console.error('[google-oauth-callback] State expired');
      // Clean up expired state
      await supabaseAdmin
        .from('oauth_states')
        .delete()
        .eq('id', oauthState.id);
      throw new Error('State expired - please try connecting again');
    }

    const codeVerifier = oauthState.code_verifier;

    const clientId = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET");
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-oauth-callback`;

    // Exchange code for tokens with PKCE
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[google-oauth-callback] Token exchange failed:', errorText);
      throw new Error(`Failed to exchange code: ${errorText}`);
    }

    const tokens = await tokenResponse.json();
    console.log('[google-oauth-callback] Tokens received successfully');

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Get user email from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
      },
    });

    const userInfo = await userInfoResponse.json();

    // Save tokens to database (already initialized above)
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        google_linked: true,
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expires_at: expiresAt,
        email: userInfo.email, // Update with Google email
      })
      .eq("id", userId);

    if (updateError) {
      console.error('[google-oauth-callback] DB update error:', updateError);
      throw new Error(`Failed to save tokens: ${updateError.message}`);
    }

    console.log('[google-oauth-callback] Successfully saved tokens');

    // Clean up used OAuth state
    await supabaseAdmin
      .from('oauth_states')
      .delete()
      .eq('id', oauthState.id);

    // Redirect back to frontend settings page
    const frontendUrl = 'https://aftermeeting.andorsoft-lab.com/settings?connected=true';
    return Response.redirect(frontendUrl, 302);

  } catch (error: any) {
    console.error("[google-oauth-callback] Error:", error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const frontendUrl = `https://aftermeeting.andorsoft-lab.com/settings?error=${encodeURIComponent(errorMessage)}`;
    return Response.redirect(frontendUrl, 302);
  }
};

serve(handler);
