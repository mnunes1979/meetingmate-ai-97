import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema
const processMeetingSchema = z.object({
  transcript: z.string().min(10, "Transcript too short").max(100000, "Transcript exceeds maximum length"),
  language: z.string().min(2).max(10).optional(),
  recordingDateTime: z.string().datetime().optional(),
});

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = tokenMatch?.[1];
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
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

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('action', 'process_meeting')
      .gte('created_at', oneHourAgo);

    if (count && count >= 20) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Maximum 20 meeting processings per hour.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate input
    const requestData = await req.json();
    const { transcript, language, recordingDateTime } = processMeetingSchema.parse(requestData);

    console.log('Processing meeting for user:', user.id);

    const systemPrompt = `You are a precise sales-ops analyst specializing in multilingual meeting analysis.

**INPUT LANGUAGE CAPABILITY:**
You can process audio transcripts in English, Portuguese (Brazilian or European), French, or Spanish. Identify the source language automatically and process it seamlessly.

**OUTPUT CONSTRAINT - CRITICAL:**
ALL output MUST be written in **European Portuguese (pt-PT)**. Never use Brazilian Portuguese expressions. Use formal European Portuguese conventions.

**REPORT STRUCTURE:**
Return a JSON object with two main fields:
1. "formatted_report" - A markdown string following this EXACT structure:
2. "structured_data" - The detailed JSON data for system processing

The "formatted_report" MUST follow this EXACT markdown format:

# 📄 Resumo Executivo
[2-3 sentences providing a high-level overview of the meeting purpose, participants, and main outcome]

# 🔑 Pontos Chave
- [Key takeaway 1]
- [Key takeaway 2]
- [Key takeaway 3]
- [Add more as needed, 3-6 points total]

# ✅ Plano de Ação
- [ ] [Task 1] — **Responsável:** [Name or "A definir"]
- [ ] [Task 2] — **Responsável:** [Name or "A definir"]
- [ ] [Add more tasks as identified]

# 📊 Análise de Sentimento
**Tom geral:** [Positivo/Neutro/Negativo]
[1-2 sentences describing the meeting atmosphere, engagement level, and any notable emotional dynamics]

**STRUCTURED DATA FORMAT:**
The "structured_data" field must contain:
- language: ALWAYS "pt" (European Portuguese)
- sentiment: "positive" | "neutral" | "negative"
- sentiment_confidence: 0.0-1.0
- customer: {name, company} - ONLY if explicitly mentioned, otherwise null
- participants: [{name, role}] - ONLY people explicitly mentioned by name. Empty array if none.
- meeting: {duration_min}
- intents: [{type: SEND_EMAIL|NOTIFY_DEPARTMENT|SCHEDULE_MEETING|SEND_PROPOSAL|ASK_INFO|FOLLOW_UP|REQUEST_APPROVAL, description, department?, deadline_iso?, priority: low|medium|high, assignee?}]
- email_drafts: [{audience: client|finance|tech|sales|support|management|custom, subject, body_md, suggested_recipients?: [], context}] - **ALWAYS end emails with "Com os melhores cumprimentos,\n{{USER_NAME}}"**
- risks: [{label, severity: low|medium|high, note, mitigation?}]
- sales_opportunities: [{title, description, product_service, estimated_value: low|medium|high, urgency: low|medium|high, probability: low|medium|high, trigger, recommended_action}]
- client_needs: [{need, importance: low|medium|high, solution}]
- objections: [{objection, type: price|timing|technical|trust|other, severity: low|medium|high, response}]
- business_insights: {overall_interest: low|medium|high, decision_stage: awareness|consideration|decision|closed, budget_indicators, timeline_indicators, competition_mentions, key_influencers}

**CRITICAL RULES - DO NOT VIOLATE:**
1. ALL text output MUST be in European Portuguese (pt-PT)
2. NEVER invent participant names - only include if explicitly stated
3. NEVER invent customer names or companies - only include if explicitly stated  
4. NEVER invent contact information (emails, phones, addresses)
5. If no names mentioned, use empty arrays
6. If customer not mentioned, set to null
7. **Email signature:** Always end with "Com os melhores cumprimentos,\n{{USER_NAME}}"
8. Current date reference: ${new Date().toISOString().split('T')[0]}
9. Timezone: Europe/Lisbon
10. Be comprehensive - identify ALL actionable items from the conversation`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze this transcript: ${transcript}` }
        ],
      }),
    });

    if (!response.ok) {
      console.error('AI Gateway error:', response.status, await response.text());
      throw new Error('Meeting analysis service temporarily unavailable. Please try again later.');
    }

    const data = await response.json();
    let content = data.choices[0].message.content;
    
    // Remove markdown code blocks if present
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    const parsed = JSON.parse(content);

    // Replace {{USER_NAME}} placeholder with actual user profile name
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .single();
    
    const userName = profile?.name || 'A Equipa';
    
    // Replace placeholder in all email drafts with European Portuguese signature
    if (parsed.structured_data?.email_drafts && Array.isArray(parsed.structured_data.email_drafts)) {
      parsed.structured_data.email_drafts = parsed.structured_data.email_drafts.map((draft: any) => ({
        ...draft,
        body_md: draft.body_md?.replace(/\{\{USER_NAME\}\}/g, userName)
          .replace(/\[O Seu Nome\]/gi, userName)
          .replace(/\[Seu Nome\]/gi, userName)
          .replace(/\[Your Name\]/gi, userName)
      }));
    }
    // Also handle legacy format if AI returns flat email_drafts
    if (parsed.email_drafts && Array.isArray(parsed.email_drafts)) {
      parsed.email_drafts = parsed.email_drafts.map((draft: any) => ({
        ...draft,
        body_md: draft.body_md?.replace(/\{\{USER_NAME\}\}/g, userName)
          .replace(/\[O Seu Nome\]/gi, userName)
          .replace(/\[Seu Nome\]/gi, userName)
          .replace(/\[Your Name\]/gi, userName)
      }));
    }

    // Log rate limit
    await supabaseAdmin.from('rate_limits').insert({
      user_id: user.id,
      action: 'process_meeting',
    });

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.errors);
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.error('Error in process-meeting:', error);
    
    // Determine appropriate status code
    let status = 500;
    let errorMessage = error.message || 'Internal server error';
    
    if (errorMessage.includes('Rate limit') || errorMessage.includes('429')) {
      status = 429;
      errorMessage = 'Rate limit exceeded. Please try again later.';
    } else if (errorMessage.includes('Payment') || errorMessage.includes('402')) {
      status = 402;
      errorMessage = 'Payment required. Please add credits to your account.';
    } else if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
      status = 401;
      errorMessage = 'Unauthorized. Please login again.';
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
