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

    // Extract user from verified JWT (verify_jwt=true ensures signature is valid)
    const token = authHeader.replace('Bearer ', '');
    try {
      const payload = JSON.parse(atob(token.split('.')[1] || ''));
      if (!payload?.sub) throw new Error('Invalid token');
    } catch {
      throw new Error('Unauthorized');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { api_key, api_token, board_id } = await req.json();

    if (!api_key || !api_token || !board_id) {
      throw new Error('API key, token and board ID are required');
    }

    // Fetch lists from Trello board
    const response = await fetch(
      `https://api.trello.com/1/boards/${board_id}/lists?key=${api_key}&token=${api_token}&fields=id,name`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Trello API error:', errorText);
      throw new Error('Failed to fetch Trello lists');
    }

    const lists = await response.json();

    return new Response(JSON.stringify({ lists }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in list-trello-lists:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
