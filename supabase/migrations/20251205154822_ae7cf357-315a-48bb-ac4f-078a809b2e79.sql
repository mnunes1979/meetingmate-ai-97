-- Add team profile fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS job_title TEXT;

-- Create meeting_comments table for contextual chat
CREATE TABLE public.meeting_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meeting_notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  mentions UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comments on accessible meetings" ON public.meeting_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.meeting_notes mn 
      WHERE mn.id = meeting_comments.meeting_id 
      AND (mn.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Users can create comments" ON public.meeting_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments" ON public.meeting_comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments" ON public.meeting_comments
  FOR DELETE USING (auth.uid() = user_id);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  reference_type TEXT,
  reference_id UUID,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);

-- Add meeting_id foreign key to tasks if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tasks' AND column_name = 'meeting_id'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN meeting_id UUID REFERENCES public.meeting_notes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create trigger for meeting_comments updated_at
CREATE TRIGGER update_meeting_comments_updated_at
  BEFORE UPDATE ON public.meeting_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();