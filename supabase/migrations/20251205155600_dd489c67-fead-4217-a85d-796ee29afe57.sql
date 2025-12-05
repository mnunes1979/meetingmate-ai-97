-- Create the audio-recordings bucket for storing audio files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio-recordings', 
  'audio-recordings', 
  false,
  104857600, -- 100MB limit
  ARRAY['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/mp4', 'audio/x-m4a']
);

-- RLS Policies for audio-recordings bucket
-- Users can upload their own audio files
CREATE POLICY "Users can upload own audio recordings"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'audio-recordings' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can view their own audio files
CREATE POLICY "Users can view own audio recordings"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'audio-recordings' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own audio files
CREATE POLICY "Users can delete own audio recordings"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'audio-recordings' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Service role can access all audio files (for transcription)
CREATE POLICY "Service role can access audio recordings"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio-recordings');