import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getApiKey } from "../_shared/get-api-key.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OpenAI Whisper file size limit (25MB)
const MAX_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB to be safe

// Input validation schema
const transcribeSchema = z.object({
  storagePath: z.string().min(1, "Storage path required"),
  mime: z.string().min(3).max(100).optional(),
  useDiarization: z.boolean().optional().default(false), // For meeting notes with speaker identification
});

// Speaker utterance from Deepgram
interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
}

interface DeepgramUtterance {
  transcript: string;
  confidence: number;
  words: DeepgramWord[];
  speaker: number;
  start: number;
  end: number;
}

interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        confidence?: number;
        words?: DeepgramWord[];
      }>;
    }>;
    utterances?: DeepgramUtterance[];
  };
  metadata?: {
    detected_language?: string;
  };
}

// Normalize language codes to ISO 639-1 format
function normalizeLanguageCode(language: string | undefined): string {
  if (!language) return 'pt';
  
  const langLower = language.toLowerCase();
  
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

// Split audio into chunks if larger than 25MB (for Whisper)
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

// Transcribe using OpenAI Whisper (for voice notes without diarization)
async function transcribeWithWhisper(
  audioData: Uint8Array, 
  mimeType: string,
  openaiKey: string
): Promise<{ text: string; language: string }> {
  const chunks = await splitAudioIntoChunks(audioData, mimeType);
  const transcriptions: string[] = [];
  let detectedLanguage = 'pt';
  
  for (let i = 0; i < chunks.length; i++) {
    const formData = new FormData();
    const extension = mimeType.includes('wav') ? 'wav' : 'webm';
    formData.append('file', chunks[i], `audio_chunk_${i}.${extension}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');
    formData.append('response_format', 'verbose_json');
    
    console.log(`[Whisper] Sending chunk ${i} to OpenAI, size: ${chunks[i].size} bytes`);
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Whisper] OpenAI API error for chunk ${i}:`, response.status, errorText);
      throw new Error(`Transcription failed for chunk ${i}: ${errorText}`);
    }

    const result = await response.json();
    console.log(`[Whisper] Chunk ${i} transcribed, text length: ${result.text?.length}`);
    
    transcriptions.push(result.text || '');
    if (i === 0) {
      detectedLanguage = result.language || 'pt';
    }
  }
  
  return {
    text: transcriptions.join(' '),
    language: normalizeLanguageCode(detectedLanguage),
  };
}

// Transcribe using Deepgram with speaker diarization (for meeting notes)
async function transcribeWithDeepgram(
  audioData: Uint8Array,
  mimeType: string,
  deepgramKey: string
): Promise<{ text: string; language: string; speakers?: Array<{ speaker: number; text: string; start: number; end: number }> }> {
  console.log('[Deepgram] Starting transcription with diarization, size:', audioData.length, 'bytes');
  
  // Deepgram API with diarization enabled
  const url = new URL('https://api.deepgram.com/v1/listen');
  url.searchParams.set('model', 'nova-2');
  url.searchParams.set('language', 'pt');
  url.searchParams.set('smart_format', 'true');
  url.searchParams.set('punctuate', 'true');
  url.searchParams.set('diarize', 'true'); // Enable speaker diarization
  url.searchParams.set('utterances', 'true'); // Get utterances grouped by speaker
  url.searchParams.set('detect_language', 'true');
  
  // Create a Blob for fetch body - cast to avoid TypeScript issues
  const audioBlob = new Blob([audioData as unknown as ArrayBuffer], { type: mimeType || 'audio/webm' });
  
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Authorization': `Token ${deepgramKey}`,
      'Content-Type': mimeType || 'audio/webm',
    },
    body: audioBlob,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Deepgram] API error:', response.status, errorText);
    throw new Error(`Deepgram transcription failed: ${errorText}`);
  }

  const result: DeepgramResponse = await response.json();
  console.log('[Deepgram] Response received');
  
  // Extract detected language
  const detectedLanguage = result.metadata?.detected_language || 'pt';
  console.log('[Deepgram] Detected language:', detectedLanguage);
  
  // Process utterances with speaker information
  const utterances = result.results?.utterances || [];
  const speakers: Array<{ speaker: number; text: string; start: number; end: number }> = [];
  
  if (utterances.length > 0) {
    console.log('[Deepgram] Processing', utterances.length, 'utterances');
    
    for (const utterance of utterances) {
      speakers.push({
        speaker: utterance.speaker,
        text: utterance.transcript,
        start: utterance.start,
        end: utterance.end,
      });
    }
    
    // Format transcript with speaker labels
    const formattedTranscript = speakers
      .map(s => `[Orador ${s.speaker + 1}]: ${s.text}`)
      .join('\n\n');
    
    console.log('[Deepgram] Formatted transcript with', new Set(speakers.map(s => s.speaker)).size, 'speakers');
    
    return {
      text: formattedTranscript,
      language: normalizeLanguageCode(detectedLanguage),
      speakers,
    };
  }
  
  // Fallback to basic transcript if no utterances
  const basicTranscript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  console.log('[Deepgram] No utterances, using basic transcript, length:', basicTranscript.length);
  
  return {
    text: basicTranscript,
    language: normalizeLanguageCode(detectedLanguage),
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
    const { storagePath, mime, useDiarization } = validatedData;
    console.log(`Storage path: ${storagePath}`);
    console.log(`Mime type: ${mime || 'not provided'}`);
    console.log(`Use diarization: ${useDiarization}`);

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
    
    // Validate audio size
    if (binaryAudio.length < 1000) {
      console.error('Audio too small:', binaryAudio.length, 'bytes');
      throw new Error('Audio file is too small or corrupted. Please record at least 3 seconds of clear audio.');
    }
    
    const audioMimeType = mime || 'audio/webm';
    let transcriptionResult: { text: string; language: string; speakers?: Array<{ speaker: number; text: string; start: number; end: number }> };
    
    if (useDiarization) {
      // Use Deepgram for meeting notes with speaker diarization
      const deepgramKey = Deno.env.get('DEEPGRAM_API_KEY');
      if (!deepgramKey) {
        console.error('DEEPGRAM_API_KEY not configured');
        throw new Error('Deepgram API key não configurada. Configure em API Keys.');
      }
      
      transcriptionResult = await transcribeWithDeepgram(binaryAudio, audioMimeType, deepgramKey);
    } else {
      // Use OpenAI Whisper for voice notes (no diarization needed)
      const openaiKey = await getApiKey('OPENAI_API_KEY');
      if (!openaiKey) {
        console.error('OPENAI_API_KEY not configured');
        throw new Error('OpenAI API key não configurada. Configure em API Keys.');
      }
      
      transcriptionResult = await transcribeWithWhisper(binaryAudio, audioMimeType, openaiKey);
    }
    
    // Validate transcription result
    if (!transcriptionResult.text || transcriptionResult.text.trim().length === 0) {
      console.error('Empty transcription result');
      throw new Error('No speech detected in audio. Please ensure you speak clearly during recording.');
    }
    
    // Log rate limit
    await supabaseAdmin.from('rate_limits').insert({
      user_id: user.id,
      action: 'transcribe',
      metadata: { 
        useDiarization,
        audioSize: binaryAudio.length,
        speakersDetected: transcriptionResult.speakers ? new Set(transcriptionResult.speakers.map(s => s.speaker)).size : 0,
      },
    });
    
    console.log('Transcription successful:', {
      language: transcriptionResult.language,
      textLength: transcriptionResult.text.length,
      useDiarization,
      speakersDetected: transcriptionResult.speakers?.length || 0,
    });

    return new Response(
      JSON.stringify({ 
        text: transcriptionResult.text,
        language: transcriptionResult.language,
        confidence: 0.95,
        speakers: transcriptionResult.speakers,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const err = error as Error & { errors?: unknown[] };
    if (err.errors) {
      console.error('Validation error:', err.errors);
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: err.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.error('Error in transcribe-audio:', error);
    
    // Determine appropriate status code
    let status = 500;
    let errorMessage = err.message || 'Internal server error';
    
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
