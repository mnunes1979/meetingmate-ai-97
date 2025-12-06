-- Table to store failed audio recordings for retry
CREATE TABLE public.failed_audio_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  file_size INTEGER,
  recording_type TEXT NOT NULL CHECK (recording_type IN ('meeting', 'voice_note')),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.failed_audio_recordings ENABLE ROW LEVEL SECURITY;

-- Users can view their own failed recordings
CREATE POLICY "Users can view their own failed recordings"
ON public.failed_audio_recordings FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own failed recordings
CREATE POLICY "Users can insert their own failed recordings"
ON public.failed_audio_recordings FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own failed recordings
CREATE POLICY "Users can delete their own failed recordings"
ON public.failed_audio_recordings FOR DELETE
USING (auth.uid() = user_id);

-- Users can update their own failed recordings
CREATE POLICY "Users can update their own failed recordings"
ON public.failed_audio_recordings FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can view all failed recordings
CREATE POLICY "Admins can view all failed recordings"
ON public.failed_audio_recordings FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete any failed recordings
CREATE POLICY "Admins can delete any failed recordings"
ON public.failed_audio_recordings FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_failed_audio_recordings_updated_at
BEFORE UPDATE ON public.failed_audio_recordings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();