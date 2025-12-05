import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema - now accepts storage path instead of base64
const transcribeSchema = z.object({
  storagePath: z.string().min(1, "Storage path required"),
  mime: z.string().min(3).max(100).optional(),
});

// Normalize language codes to ISO 639-1 format
function normalizeLanguageCode(language: string | undefined): string {
  if (!language) return 'ca';
  
  const langLower = language.toLowerCase();
  
  // Map common language names/codes to ISO 639-1
  const languageMap: Record<string, string> = {
    'portuguese': 'pt',
    'pt': 'pt',
    'pt-br': 'pt',
    'pt-pt': 'pt',
    'catalan': 'ca',
    'català': 'ca',
    'ca': 'ca',
    'spanish': 'es',
    'español': 'es',
    'es': 'es',
    'english': 'en',
    'en': 'en',
    'en-us': 'en',
    'en-gb': 'en',
    'french': 'fr',
    'français': 'fr',
    'fr': 'fr',
  };
  
  return languageMap[langLower] || 'ca';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('=== Transcribe Audio Function Started ===');
    
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      throw new Error('Missing authorization header');
    }

    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = tokenMatch?.[1];
    if (!token) {
      console.error('Invalid authorization header format');
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
      console.error('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('User authenticated:', user.id);

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
      .eq('action', 'transcribe')
      .gte('created_at', oneHourAgo);

    if (count && count >= 10) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Maximum 10 transcriptions per hour.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate input
    console.log('Reading request body...');
    const requestData = await req.json();
    console.log('Request data received, validating...');
    
    const validatedData = transcribeSchema.parse(requestData);
    const { storagePath, mime } = validatedData;
    console.log(`Storage path: ${storagePath}`);
    console.log(`Mime type: ${mime || 'not provided'}`);

    console.log('Processing audio transcription for user:', user.id);

    // Download audio from storage
    console.log('Downloading audio from storage...');
    const { data: audioData, error: downloadError } = await supabaseAdmin.storage
      .from('audio-recordings')
      .download(storagePath);
    
    if (downloadError || !audioData) {
      console.error('Failed to download audio:', downloadError);
      throw new Error('Failed to download audio from storage');
    }
    
    const binaryAudio = new Uint8Array(await audioData.arrayBuffer());
    console.log(`Audio downloaded: ${binaryAudio.length} bytes`);
    
    // Validate audio size (minimum 1KB for reasonable audio)
    if (binaryAudio.length < 1000) {
      console.error('Audio too small:', binaryAudio.length, 'bytes');
      throw new Error('Audio file is too small or corrupted. Please record at least 3 seconds of clear audio.');
    }
    
    // Prepare form data
    const audioMimeType = mime || 'audio/webm';
    const formData = new FormData();
    const blob = new Blob([binaryAudio], { type: audioMimeType });
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'ca');
    formData.append('response_format', 'verbose_json');
    
    console.log('Audio blob created:', blob.size, 'bytes, type:', blob.type);

    // Send to OpenAI Whisper
    console.log('Sending request to OpenAI Whisper API...');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      console.error('OPENAI_API_KEY not configured');
      throw new Error('OpenAI API key not configured');
    }
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: formData,
    });

    console.log('OpenAI response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error('Transcription service temporarily unavailable. Please try again later.');
    }

    const result = await response.json();
    console.log('OpenAI response received successfully');
    
    // Validate transcription result
    if (!result.text || result.text.trim().length === 0) {
      console.error('Empty transcription result from OpenAI');
      throw new Error('No speech detected in audio. Please ensure you speak clearly during recording.');
    }
    
    // Normalize language code to ISO 639-1 format
    const normalizedLanguage = normalizeLanguageCode(result.language);
    
    // Log rate limit
    await supabaseAdmin.from('rate_limits').insert({
      user_id: user.id,
      action: 'transcribe',
    });
    
    console.log('Transcription successful:', {
      originalLanguage: result.language,
      normalizedLanguage: normalizedLanguage,
      textLength: result.text?.length,
    });

    return new Response(
      JSON.stringify({ 
        text: result.text,
        language: normalizedLanguage,
        confidence: 0.95 
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
    
    console.error('Error in transcribe-audio:', error);
    
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
      {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
