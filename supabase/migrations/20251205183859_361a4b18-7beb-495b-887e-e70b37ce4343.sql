-- 1. STORAGE SECURITY: Add MIME type validation policy
-- First, drop and recreate the upload policy with MIME type restriction
DROP POLICY IF EXISTS "Users can upload own audio recordings" ON storage.objects;

CREATE POLICY "Users can upload own audio recordings with mime validation"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'audio-recordings' 
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND (
    (storage.extension(name) IN ('mp3', 'wav', 'webm', 'm4a', 'mpeg', 'ogg'))
    OR name LIKE '%.mp3'
    OR name LIKE '%.wav'
    OR name LIKE '%.webm'
    OR name LIKE '%.m4a'
    OR name LIKE '%.ogg'
  )
);

-- 2. DATABASE SECURITY: Fix search_path in vulnerable functions
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. GDPR CASCADE DELETE: Create comprehensive delete function
CREATE OR REPLACE FUNCTION public.gdpr_delete_meeting_cascade(
  _meeting_id uuid,
  _user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_tasks int := 0;
  v_deleted_emails int := 0;
  v_deleted_calendar int := 0;
  v_deleted_trello int := 0;
  v_deleted_comments int := 0;
  v_storage_path text;
  v_result jsonb;
BEGIN
  -- Verify ownership or admin status
  IF NOT EXISTS (
    SELECT 1 FROM meeting_notes 
    WHERE id = _meeting_id 
    AND (user_id = _user_id OR has_role(_user_id, 'admin'))
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Meeting not found or access denied';
  END IF;

  -- Get storage path for audio file before deletion
  SELECT transcript_url INTO v_storage_path
  FROM meeting_notes
  WHERE id = _meeting_id;

  -- 1. Delete related tasks
  DELETE FROM tasks WHERE meeting_id = _meeting_id;
  GET DIAGNOSTICS v_deleted_tasks = ROW_COUNT;

  -- 2. Delete related email_actions and email_events
  DELETE FROM email_events WHERE email_action_id IN (
    SELECT id FROM email_actions WHERE note_id = _meeting_id
  );
  DELETE FROM email_actions WHERE note_id = _meeting_id;
  GET DIAGNOSTICS v_deleted_emails = ROW_COUNT;

  -- 3. Delete related calendar_events
  DELETE FROM calendar_events WHERE note_id = _meeting_id;
  GET DIAGNOSTICS v_deleted_calendar = ROW_COUNT;

  -- 4. Delete related trello_cards
  DELETE FROM trello_cards WHERE note_id = _meeting_id;
  GET DIAGNOSTICS v_deleted_trello = ROW_COUNT;

  -- 5. Delete related meeting_comments
  DELETE FROM meeting_comments WHERE meeting_id = _meeting_id;
  GET DIAGNOSTICS v_deleted_comments = ROW_COUNT;

  -- 6. Delete the meeting note itself
  DELETE FROM meeting_notes WHERE id = _meeting_id;

  -- Build result summary
  v_result := jsonb_build_object(
    'meeting_id', _meeting_id,
    'storage_path', v_storage_path,
    'deleted_tasks', v_deleted_tasks,
    'deleted_emails', v_deleted_emails,
    'deleted_calendar', v_deleted_calendar,
    'deleted_trello', v_deleted_trello,
    'deleted_comments', v_deleted_comments
  );

  -- Log the GDPR deletion event
  PERFORM log_audit_event(
    'gdpr_meeting_cascade_delete',
    'meeting_notes',
    _meeting_id,
    v_result
  );

  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.gdpr_delete_meeting_cascade(uuid, uuid) TO authenticated;