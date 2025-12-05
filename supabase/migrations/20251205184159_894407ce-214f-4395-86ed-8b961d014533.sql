-- =============================================
-- ZOMBIE CODE CLEANUP MIGRATION
-- Removes unused Google Calendar and Trello integrations
-- =============================================

-- 1. DROP DEPENDENT TABLES FIRST (due to foreign keys)
DROP TABLE IF EXISTS calendar_events CASCADE;
DROP TABLE IF EXISTS trello_cards CASCADE;

-- 2. DROP UNUSED FUNCTIONS (Google Calendar related)
DROP FUNCTION IF EXISTS public.get_google_access_token(uuid);
DROP FUNCTION IF EXISTS public.get_google_token_status(uuid);
DROP FUNCTION IF EXISTS public.is_google_calendar_connected(uuid);
DROP FUNCTION IF EXISTS public.update_oauth_tokens(uuid, text, text, timestamp with time zone);

-- 3. DROP UNUSED FUNCTIONS (Trello related)
DROP FUNCTION IF EXISTS public.get_trello_credentials(uuid);
DROP FUNCTION IF EXISTS public.update_trello_config(uuid, text, text, text, text, text, text);

-- 4. DROP UNUSED COLUMNS FROM PROFILES TABLE (Google)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS google_access_token;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS google_refresh_token;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS google_token_expires_at;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS google_linked;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS google_calendar_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS google_calendar_summary;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS google_calendar_timezone;

-- 5. DROP UNUSED COLUMNS FROM PROFILES TABLE (Trello)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS trello_api_key;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS trello_api_token;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS trello_board_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS trello_board_name;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS trello_linked;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS trello_list_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS trello_list_name;

-- 6. Log the cleanup
INSERT INTO public.audit_logs (action, resource_type, metadata)
VALUES (
  'zombie_code_cleanup',
  'database_schema',
  '{"dropped_tables": ["calendar_events", "trello_cards"], "dropped_functions": ["get_google_access_token", "get_google_token_status", "is_google_calendar_connected", "update_oauth_tokens", "get_trello_credentials", "update_trello_config"], "dropped_columns": ["google_access_token", "google_refresh_token", "google_token_expires_at", "google_linked", "google_calendar_id", "google_calendar_summary", "google_calendar_timezone", "trello_api_key", "trello_api_token", "trello_board_id", "trello_board_name", "trello_linked", "trello_list_id", "trello_list_name"]}'::jsonb
);