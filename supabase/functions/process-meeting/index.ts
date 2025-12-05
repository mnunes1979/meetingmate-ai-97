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

    const systemPrompt = `You are a precise sales-ops analyst. Analyze the meeting transcript comprehensively and return a JSON object with:

- language: ALWAYS "ca" (Catalan)
- summary: {
    overview: "Brief 2-3 sentence overview of the meeting IN CATALAN",
    topics_discussed: ["Topic 1", "Topic 2", "Topic 3"] - Main topics discussed IN CATALAN,
    key_points: ["Point 1", "Point 2"] - 3-6 most important points IN CATALAN,
    strengths: ["Strength 1", "Strength 2"] - Positive aspects, opportunities, what went well IN CATALAN,
    weaknesses: ["Weakness 1", "Weakness 2"] - Concerns, risks, challenges, objections IN CATALAN,
    action_items: ["Action 1", "Action 2"] - Concrete next steps identified IN CATALAN
  }
- sentiment (positive/neutral/negative) - Overall tone of the meeting
- sentiment_confidence (0.0-1.0) - How confident you are about the sentiment
- customer: {name, company} - ONLY if explicitly mentioned in the audio, otherwise null
- participants: [{name, role IN CATALAN}] - ONLY people explicitly mentioned by name in the audio. If no names mentioned, return empty array []
- meeting: {duration_min} - IMPORTANT: Do NOT include datetime_iso, it will be provided separately
- intents: [{type: SEND_EMAIL|NOTIFY_DEPARTMENT|SCHEDULE_MEETING|SEND_PROPOSAL|ASK_INFO|FOLLOW_UP|REQUEST_APPROVAL, description IN CATALAN, department?, deadline_iso?, priority: low|medium|high, assignee?}]
- trello_tasks: [{title IN CATALAN: "Clear, actionable task title", description IN CATALAN: "Detailed task description with context", priority: low|medium|high, due_date_iso?: "Suggested due date if mentioned", assignee?: "Person's name if mentioned", context IN CATALAN: "Why this task is needed based on the conversation"}] - Extract ALL tasks, to-dos, action items, or follow-ups mentioned that should be tracked. Look for phrases like "precisamos fazer", "temos que", "vamos criar", "adicionar tarefa", "follow-up", "lembrar de", etc.
- email_drafts: [{audience: client|finance|tech|sales|support|management|custom, subject IN CATALAN, body_md IN CATALAN, suggested_recipients?: [], context IN CATALAN: "why this email is needed"}] - Create detailed, professional email drafts IN CATALAN for EVERY action that requires communication. Include follow-ups, proposals, information requests, internal notifications. **CRITICAL: Always end emails with "Cordialment,\n{{USER_NAME}}" - this placeholder will be replaced with the actual user name.**
- calendar_events: [{title IN CATALAN, description IN CATALAN, proposed_datetime_iso, duration_min, attendees: [{name, email?}], notes IN CATALAN, meeting_type: "follow_up|demo|negotiation|technical|internal"}] - For any meeting mentioned or needs to be scheduled.
- risks: [{label IN CATALAN, severity: low|medium|high, note IN CATALAN, mitigation? IN CATALAN: "suggested action to address this risk"}]
- sales_opportunities: [{
    title IN CATALAN: "Brief opportunity title",
    description IN CATALAN: "Detailed description of the sales opportunity",
    product_service IN CATALAN: "Which product/service could be sold",
    estimated_value: "low|medium|high" - Potential business value,
    urgency: "low|medium|high" - How urgent is this opportunity,
    probability: "low|medium|high" - Likelihood of closing,
    trigger IN CATALAN: "What in the conversation indicated this opportunity",
    recommended_action IN CATALAN: "What should be done next to pursue this"
  }] - Identify ALL potential sales opportunities mentioned or implied
- client_needs: [{
    need IN CATALAN: "Specific client need or pain point",
    importance: "low|medium|high",
    solution IN CATALAN: "How our product/service addresses this need"
  }] - Extract explicit and implicit client needs
- objections: [{
    objection IN CATALAN: "Client concern or objection",
    type: "price|timing|technical|trust|other",
    severity: "low|medium|high",
    response IN CATALAN: "Suggested response or how to address it"
  }] - Any concerns or objections raised by the client
- business_insights: {
    overall_interest: "low|medium|high" - Client's overall interest level,
    decision_stage: "awareness|consideration|decision|closed" - Where they are in buying journey,
    budget_indicators IN CATALAN: "Any mentions about budget or financial capacity",
    timeline_indicators IN CATALAN: "Any mentions about when they need solution",
    competition_mentions IN CATALAN: "Any mentions of competitors or alternatives",
    key_influencers IN CATALAN: "Who seems to be the decision maker(s)"
  }

CRITICAL INSTRUCTIONS - DO NOT INVENT INFORMATION:
- EVERYTHING must be written in CATALAN (ca) regardless of the transcript language
- The transcript can be in Portuguese, Spanish, English, French or Catalan, but ALL output MUST be in Catalan
- Be COMPREHENSIVE - identify ALL actionable items from the conversation
- **NEVER INVENT PARTICIPANT NAMES** - Only include participants if their names are explicitly mentioned in the audio
- **NEVER INVENT CUSTOMER NAMES OR COMPANIES** - Only include if explicitly stated in the audio
- **NEVER INVENT CONTACT INFORMATION** - Do not make up emails, phone numbers, or addresses
- If participant names are not mentioned, return empty array for participants: []
- If customer name/company not mentioned, set customer to null
- For emails: create drafts IN CATALAN for client follow-ups, internal updates to relevant departments, proposals, scheduling confirmations
- **ALWAYS end email body with: "Cordialment,\n{{USER_NAME}}" - this exact placeholder will be automatically replaced**
- For meetings: if someone says "let's schedule" or "we need to meet", create a calendar event even if date/time not specified (suggest next week)
- CRITICAL: Do NOT infer or invent the meeting date/time from the transcript - it will be provided separately as the actual recording time
- **CURRENT DATE: 2025-11-07** - Use this as reference for any date calculations
- Current timezone: Europe/Lisbon
- MANDATORY: All text fields in the output MUST be in Catalan language
- ONLY extract information that is EXPLICITLY stated in the audio transcript`;

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
    
    const userName = profile?.name || 'L\'Equip';
    
    // Replace placeholder in all email drafts
    if (parsed.email_drafts && Array.isArray(parsed.email_drafts)) {
      parsed.email_drafts = parsed.email_drafts.map((draft: any) => ({
        ...draft,
        body_md: draft.body_md?.replace(/\{\{USER_NAME\}\}/g, userName)
          .replace(/\[El teu Nom\]/gi, userName)
          .replace(/\[El vostre Nom\]/gi, userName)
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
