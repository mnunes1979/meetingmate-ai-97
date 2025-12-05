import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getApiKey } from "../_shared/get-api-key.ts";

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

// Structured output schema for validation
const structuredOutputSchema = z.object({
  summary: z.string(),
  sentiment_score: z.number().min(0).max(100),
  opportunities: z.array(z.string()),
  risks: z.array(z.string()),
  action_items: z.array(z.object({
    task: z.string(),
    assignee: z.string(),
    priority: z.enum(['High', 'Medium', 'Low']),
  })),
  topics: z.array(z.string()),
  // Extended fields for compatibility with existing system
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  formatted_report: z.string().optional(),
  customer: z.object({
    name: z.string().nullable(),
    company: z.string().nullable(),
  }).nullable().optional(),
  participants: z.array(z.object({
    name: z.string(),
    role: z.string().optional(),
  })).optional(),
  intents: z.array(z.any()).optional(),
  email_drafts: z.array(z.any()).optional(),
  sales_opportunities: z.array(z.any()).optional(),
  client_needs: z.array(z.any()).optional(),
  objections: z.array(z.any()).optional(),
  business_insights: z.any().optional(),
});

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

    // Get OpenAI API key from database or environment
    const openaiKey = await getApiKey('OPENAI_API_KEY');
    if (!openaiKey) {
      console.error('OPENAI_API_KEY not configured');
      throw new Error('OpenAI API key not configured. Please configure it in API Keys settings.');
    }

    const systemPrompt = `You are a precise sales-ops analyst specializing in multilingual meeting analysis.

**INPUT LANGUAGE CAPABILITY:**
You can process audio transcripts in English, Portuguese (Brazilian or European), French, or Spanish. Identify the source language automatically and process it seamlessly.

**OUTPUT CONSTRAINT - CRITICAL:**
ALL output MUST be written in **European Portuguese (pt-PT)**. Never use Brazilian Portuguese expressions. Use formal European Portuguese conventions.

**REQUIRED JSON OUTPUT STRUCTURE:**
You MUST return a valid JSON object with these EXACT fields:

{
  "summary": "String - Executive summary of the meeting in 2-4 sentences",
  "sentiment_score": Number 0-100 where 0 is angry/critical and 100 is excellent/very positive,
  "sentiment": "positive" | "neutral" | "negative",
  "opportunities": ["Array of strings - Specific business opportunities detected"],
  "risks": ["Array of strings - Critical situations or unhappy client remarks"],
  "action_items": [
    {
      "task": "Description of the task",
      "assignee": "Person responsible or 'A definir'",
      "priority": "High" | "Medium" | "Low"
    }
  ],
  "topics": ["Array of strings - Main topics discussed"],
  "formatted_report": "Markdown formatted report (see structure below)",
  "customer": { "name": "string or null", "company": "string or null" },
  "participants": [{ "name": "string", "role": "string" }],
  "intents": [{ "type": "SEND_EMAIL|NOTIFY_DEPARTMENT|SCHEDULE_MEETING|SEND_PROPOSAL|FOLLOW_UP", "description": "string", "priority": "low|medium|high", "assignee": "string" }],
  "email_drafts": [{ "audience": "client|finance|tech|sales|support|management", "subject": "string", "body_md": "string", "context": "string" }],
  "sales_opportunities": [{ "title": "string", "description": "string", "estimated_value": "low|medium|high", "urgency": "low|medium|high", "recommended_action": "string" }],
  "client_needs": [{ "need": "string", "importance": "low|medium|high", "solution": "string" }],
  "objections": [{ "objection": "string", "type": "price|timing|technical|trust|other", "severity": "low|medium|high", "response": "string" }],
  "business_insights": { "overall_interest": "low|medium|high", "decision_stage": "awareness|consideration|decision|closed", "budget_indicators": "string", "timeline_indicators": "string" }
}

**FORMATTED REPORT STRUCTURE (for formatted_report field):**

# 📄 Resumo Executivo
[2-3 sentences providing a high-level overview of the meeting purpose, participants, and main outcome]

# 🔑 Pontos Chave
- [Key takeaway 1]
- [Key takeaway 2]
- [Key takeaway 3]

# ✅ Plano de Ação
- [ ] [Task 1] — **Responsável:** [Name or "A definir"] — **Prioridade:** [Alta/Média/Baixa]
- [ ] [Task 2] — **Responsável:** [Name or "A definir"] — **Prioridade:** [Alta/Média/Baixa]

# 📊 Análise de Sentimento
**Pontuação:** [sentiment_score]/100
**Tom geral:** [Positivo/Neutro/Negativo]
[1-2 sentences describing the meeting atmosphere]

# 💼 Oportunidades de Negócio
- [Opportunity 1]
- [Opportunity 2]

# ⚠️ Riscos Identificados
- [Risk 1]
- [Risk 2]

**SENTIMENT SCORE GUIDELINES:**
- 0-20: Very negative (angry, critical, complaints)
- 21-40: Negative (dissatisfied, concerned)
- 41-60: Neutral (factual, mixed feelings)
- 61-80: Positive (satisfied, constructive)
- 81-100: Very positive (enthusiastic, excellent rapport)

**CRITICAL RULES - DO NOT VIOLATE:**
1. ALL text output MUST be in European Portuguese (pt-PT)
2. NEVER invent participant names - only include if explicitly stated
3. NEVER invent customer names or companies - only include if explicitly stated
4. NEVER invent contact information (emails, phones, addresses)
5. If no names mentioned, use empty arrays
6. If customer not mentioned, set to null
7. **Email signature:** Always end emails with "Com os melhores cumprimentos,\\n{{USER_NAME}}"
8. Current date reference: ${new Date().toISOString().split('T')[0]}
9. Timezone: Europe/Lisbon
10. Be comprehensive - identify ALL actionable items from the conversation
11. Return ONLY valid JSON - no markdown code blocks, no extra text`;

    console.log('Sending request to OpenAI API...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze this transcript and return the structured JSON: ${transcript}` }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error('Meeting analysis service temporarily unavailable. Please try again later.');
    }

    const data = await response.json();
    let content = data.choices[0].message.content;
    
    console.log('OpenAI response received, parsing JSON...');
    
    // Remove markdown code blocks if present (safety measure)
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.error('Raw content:', content.substring(0, 500));
      throw new Error('Failed to parse meeting analysis. Please try again.');
    }

    // Validate required fields exist
    if (!parsed.summary || typeof parsed.sentiment_score !== 'number') {
      console.error('Missing required fields in AI response');
      throw new Error('Invalid analysis response. Please try again.');
    }

    // Replace {{USER_NAME}} placeholder with actual user profile name
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .single();
    
    const userName = profile?.name || 'A Equipa';
    
    // Replace placeholder in all email drafts
    if (parsed.email_drafts && Array.isArray(parsed.email_drafts)) {
      parsed.email_drafts = parsed.email_drafts.map((draft: any) => ({
        ...draft,
        body_md: draft.body_md?.replace(/\{\{USER_NAME\}\}/g, userName)
          .replace(/\[O Seu Nome\]/gi, userName)
          .replace(/\[Seu Nome\]/gi, userName)
          .replace(/\[Your Name\]/gi, userName)
      }));
    }

    // Ensure arrays exist
    parsed.opportunities = parsed.opportunities || [];
    parsed.risks = parsed.risks || [];
    parsed.action_items = parsed.action_items || [];
    parsed.topics = parsed.topics || [];
    parsed.participants = parsed.participants || [];
    parsed.intents = parsed.intents || [];

    // Convert sentiment_score to sentiment string if not present
    if (!parsed.sentiment) {
      if (parsed.sentiment_score >= 61) {
        parsed.sentiment = 'positive';
      } else if (parsed.sentiment_score <= 40) {
        parsed.sentiment = 'negative';
      } else {
        parsed.sentiment = 'neutral';
      }
    }

    // Log rate limit
    await supabaseAdmin.from('rate_limits').insert({
      user_id: user.id,
      action: 'process_meeting',
    });

    console.log('Meeting analysis successful:', {
      summary_length: parsed.summary?.length,
      sentiment_score: parsed.sentiment_score,
      opportunities: parsed.opportunities?.length,
      risks: parsed.risks?.length,
      action_items: parsed.action_items?.length,
      topics: parsed.topics?.length,
    });

    // Return both structured_data format (for legacy compatibility) and new flat format
    return new Response(
      JSON.stringify({
        ...parsed,
        structured_data: parsed, // For backward compatibility
      }),
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
