-- Add new structured analysis columns to meeting_notes table
ALTER TABLE public.meeting_notes 
ADD COLUMN IF NOT EXISTS sentiment_score integer CHECK (sentiment_score >= 0 AND sentiment_score <= 100),
ADD COLUMN IF NOT EXISTS opportunities jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS action_items jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS topics jsonb DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.meeting_notes.sentiment_score IS 'Sentiment score 0-100 where 0 is angry/critical and 100 is excellent';
COMMENT ON COLUMN public.meeting_notes.opportunities IS 'Array of business opportunities detected';
COMMENT ON COLUMN public.meeting_notes.action_items IS 'Array of action items with task, assignee, and priority';
COMMENT ON COLUMN public.meeting_notes.topics IS 'Array of main topics discussed';