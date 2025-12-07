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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { meetingId } = await req.json();
    
    if (!meetingId) {
      return new Response(JSON.stringify({ error: 'ID da reunião é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch meeting data
    const { data: meeting, error: meetingError } = await supabase
      .from('meeting_notes')
      .select('*')
      .eq('id', meetingId)
      .eq('user_id', user.id)
      .single();

    if (meetingError || !meeting) {
      console.error('Meeting fetch error:', meetingError);
      return new Response(JSON.stringify({ error: 'Reunião não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user profile for name
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', user.id)
      .single();

    const userName = profile?.name || 'Comercial';
    const summary = meeting.summary || '';
    const actionItems = meeting.action_items || [];
    const opportunities = meeting.opportunities || [];
    const customerName = meeting.customer_name || 'Cliente';
    const customerCompany = meeting.customer_company || '';

    // Build context for AI
    const context = `
Dados da Reunião:
- Cliente: ${customerName}${customerCompany ? ` (${customerCompany})` : ''}
- Data: ${meeting.meeting_datetime ? new Date(meeting.meeting_datetime).toLocaleDateString('pt-PT') : 'Não especificada'}
- Resumo: ${summary}
- Ações Acordadas: ${actionItems.map((a: any) => a.task || a).join(', ') || 'Nenhuma'}
- Oportunidades Identificadas: ${opportunities.join(', ') || 'Nenhuma'}
- Nome do Remetente: ${userName}
`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    const systemPrompt = `És um assistente profissional de vendas. Gera um email de follow-up em Português de Portugal.

O email deve:
1. Ser profissional mas cordial
2. Agradecer a reunião
3. Resumir os principais pontos discutidos
4. Listar os próximos passos acordados
5. Terminar com uma chamada à ação

Responde APENAS com o email, sem explicações adicionais. Usa formatação markdown.`;

    // Generating follow-up email

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Gera um email de follow-up com base nestes dados:\n${context}` }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Lovable AI error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente mais tarde.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`Erro na API de IA: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const emailContent = aiData.choices?.[0]?.message?.content || '';

    if (!emailContent) {
      throw new Error('Não foi possível gerar o email');
    }

    // Generate subject
    const subject = `Follow-up: Reunião ${customerCompany || customerName} - ${meeting.meeting_datetime ? new Date(meeting.meeting_datetime).toLocaleDateString('pt-PT') : 'Recente'}`;

    // Email generated successfully

    return new Response(JSON.stringify({
      subject,
      body: emailContent,
      customerName,
      customerCompany,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-followup-email:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Erro interno do servidor' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
