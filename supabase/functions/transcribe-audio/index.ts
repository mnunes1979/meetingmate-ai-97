import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OpenAI Whisper file size limit (25MB)
const MAX_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB to be safe

// Input validation schema - now accepts storage path instead of base64
const transcribeSchema = z.object({
  storagePath: z.string().min(1, "Storage path required"),
  mime: z.string().min(3).max(100).optional(),
});

// Normalize language codes to ISO 639-1 format
function normalizeLanguageCode(language: string | undefined): string {
  if (!language) return 'pt';
  
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
  
  return languageMap[langLower] || 'pt';
}

// Split audio into chunks if larger than 25MB
async function splitAudioIntoChunks(audioData: Uint8Array, mimeType: string): Promise<Blob[]> {
  const totalSize = audioData.length;
  
  if (totalSize <= MAX_CHUNK_SIZE) {
    console.log('[Chunking] Audio size within limit, no chunking needed:', totalSize, 'bytes');
    return [new Blob([new Uint8Array(audioData)], { type: mimeType })];
  }
  
  console.log('[Chunking] Audio exceeds limit, splitting into chunks. Total size:', totalSize, 'bytes');
  
  const chunks: Blob[] = [];
  let offset = 0;
  let chunkIndex = 0;
  
  while (offset < totalSize) {
    const chunkSize = Math.min(MAX_CHUNK_SIZE, totalSize - offset);
    const chunkData = new Uint8Array(audioData.slice(offset, offset + chunkSize));
    chunks.push(new Blob([chunkData], { type: mimeType }));
    
    console.log(`[Chunking] Chunk ${chunkIndex}: ${chunkSize} bytes (offset: ${offset})`);
    
    offset += chunkSize;
    chunkIndex++;
  }
  
  console.log(`[Chunking] Created ${chunks.length} chunks`);
  return chunks;
}

// Transcribe a single audio chunk
async function transcribeChunk(
  chunk: Blob, 
  openaiKey: string, 
  chunkIndex: number
): Promise<{ text: string; language: string }> {
  const formData = new FormData();
  const extension = chunk.type.includes('wav') ? 'wav' : 'webm';
  formData.append('file', chunk, `audio_chunk_${chunkIndex}.${extension}`);
  formData.append('model', 'whisper-1');
  formData.append('language', 'pt'); // Default to Portuguese
  formData.append('response_format', 'verbose_json');
  
  console.log(`[Transcribe] Sending chunk ${chunkIndex} to OpenAI, size: ${chunk.size} bytes`);
  
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Transcribe] OpenAI API error for chunk ${chunkIndex}:`, response.status, errorText);
    throw new Error(`Transcription failed for chunk ${chunkIndex}: ${errorText}`);
  }

  const result = await response.json();
  console.log(`[Transcribe] Chunk ${chunkIndex} transcribed, text length: ${result.text?.length}`);
  
  return {
    text: result.text || '',
    language: result.language || 'pt',
  };
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
    
    // Get OpenAI key
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      console.error('OPENAI_API_KEY not configured');
      throw new Error('OpenAI API key not configured');
    }
    
    const audioMimeType = mime || 'audio/webm';
    
    // Split into chunks if necessary
    const chunks = await splitAudioIntoChunks(binaryAudio, audioMimeType);
    
    // Transcribe all chunks
    const transcriptions: string[] = [];
    let detectedLanguage = 'pt';
    
    for (let i = 0; i < chunks.length; i++) {
      const result = await transcribeChunk(chunks[i], openaiKey, i);
      transcriptions.push(result.text);
      if (i === 0) {
        detectedLanguage = result.language; // Use language from first chunk
      }
    }
    
    // Combine all transcriptions
    const fullTranscript = transcriptions.join(' ');
    
    // Validate transcription result
    if (!fullTranscript || fullTranscript.trim().length === 0) {
      console.error('Empty transcription result from OpenAI');
      throw new Error('No speech detected in audio. Please ensure you speak clearly during recording.');
    }
    
    // Normalize language code to ISO 639-1 format
    const normalizedLanguage = normalizeLanguageCode(detectedLanguage);
    
    // Log rate limit
    await supabaseAdmin.from('rate_limits').insert({
      user_id: user.id,
      action: 'transcribe',
      metadata: { chunks: chunks.length, audioSize: binaryAudio.length },
    });
    
    console.log('Transcription successful:', {
      originalLanguage: detectedLanguage,
      normalizedLanguage: normalizedLanguage,
      textLength: fullTranscript.length,
      chunks: chunks.length,
    });

    return new Response(
      JSON.stringify({ 
        text: fullTranscript,
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
