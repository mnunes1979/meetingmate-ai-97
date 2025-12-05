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

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        trello_api_key: null,
        trello_api_token: null,
        trello_board_id: null,
        trello_board_name: null,
        trello_list_id: null,
        trello_list_name: null,
        trello_linked: false,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error disconnecting Trello:', updateError);
      throw new Error('Failed to disconnect Trello');
    }

    await supabase.rpc('log_audit_event', {
      _action: 'trello_disconnected',
      _resource_type: 'profiles',
      _resource_id: user.id,
    });

    return new Response(
      JSON.stringify({ success: true, message: 'Trello disconnected successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in disconnect-trello:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
