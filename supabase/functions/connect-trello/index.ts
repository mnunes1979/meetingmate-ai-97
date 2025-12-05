import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // Extract user from verified JWT
    const token = authHeader.replace('Bearer ', '');
    let userId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1] || ''));
      userId = payload?.sub || null;
    } catch {
      throw new Error('Unauthorized');
    }

    if (!userId) throw new Error('Unauthorized');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { api_key, api_token, board_id, board_name, list_id, list_name } = await req.json();

    if (!api_key || !api_token || !board_id || !list_id) {
      throw new Error('All Trello configuration fields are required');
    }

    // Verify the connection works by making a test call
    const testResponse = await fetch(
      `https://api.trello.com/1/boards/${board_id}?key=${api_key}&token=${api_token}`,
      { method: 'GET' }
    );

    if (!testResponse.ok) {
      throw new Error('Failed to verify Trello connection');
    }

    const { error: updateError } = await supabase.rpc('update_trello_config', {
      _user_id: userId,
      _api_key: api_key,
      _api_token: api_token,
      _board_id: board_id,
      _board_name: board_name,
      _list_id: list_id,
      _list_name: list_name,
    });

    if (updateError) {
      console.error('Error updating Trello config:', updateError);
      throw new Error('Failed to save Trello configuration');
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Trello connected successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in connect-trello:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
