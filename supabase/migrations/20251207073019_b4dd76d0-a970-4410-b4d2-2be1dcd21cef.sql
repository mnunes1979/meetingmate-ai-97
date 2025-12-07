-- Drop the function first (required when changing return type)
DROP FUNCTION IF EXISTS public.get_safe_profile(uuid);

-- Recreate with correct columns only
CREATE FUNCTION public.get_safe_profile(profile_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  email text,
  timezone text,
  digest_hour integer,
  digest_email text,
  active boolean,
  retention_days integer,
  allowed_email_domains jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  department_id uuid,
  access_type public.access_type,
  avatar_url text,
  job_title text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id, name, email, timezone, digest_hour, digest_email, active, retention_days,
    allowed_email_domains, created_at, updated_at, department_id, access_type,
    avatar_url, job_title
  FROM public.profiles
  WHERE id = profile_id AND (auth.uid() = id OR has_role(auth.uid(), 'admin'::app_role));
$$;

-- Drop obsolete functions related to removed integrations
DROP FUNCTION IF EXISTS public.get_trello_credentials(uuid);
DROP FUNCTION IF EXISTS public.is_google_calendar_connected(uuid);
DROP FUNCTION IF EXISTS public.update_trello_config(uuid, text, text, text, text, text, text);