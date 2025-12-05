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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { title, description, due_date, note_id } = await req.json();

    if (!title) {
      throw new Error('Task title is required');
    }

    // Get Trello credentials from secure function
    const { data: credentials, error: credError } = await supabase
      .rpc('get_trello_credentials', { _user_id: user.id })
      .single() as { data: { api_key: string; api_token: string; board_id: string; list_id: string } | null; error: any };

    if (credError || !credentials || !credentials.api_key || !credentials.api_token) {
      throw new Error('Trello not connected. Please configure Trello in settings.');
    }

    // Create card in Trello
    const trelloUrl = new URL('https://api.trello.com/1/cards');
    trelloUrl.searchParams.append('key', credentials.api_key);
    trelloUrl.searchParams.append('token', credentials.api_token);
    trelloUrl.searchParams.append('idList', credentials.list_id);
    trelloUrl.searchParams.append('name', title);
    if (description) {
      trelloUrl.searchParams.append('desc', description);
    }
    if (due_date) {
      trelloUrl.searchParams.append('due', new Date(due_date).toISOString());
    }

    const response = await fetch(trelloUrl.toString(), { method: 'POST' });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Trello API error:', errorText);
      throw new Error('Failed to create Trello card');
    }

    const card = await response.json();

    // Save card info to database
    const { error: dbError } = await supabase
      .from('trello_cards')
      .insert({
        user_id: user.id,
        note_id: note_id,
        external_id: card.id,
        title: title,
        description: description || null,
        due_date: due_date || null,
        status: 'created',
      });

    if (dbError) {
      console.error('Error saving card to database:', dbError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        card_id: card.id,
        card_url: card.url,
        message: 'Tarefa criada no Trello com sucesso' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in create-trello-card:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
