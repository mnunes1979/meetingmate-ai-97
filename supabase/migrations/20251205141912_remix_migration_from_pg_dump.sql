CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: access_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.access_type AS ENUM (
    'full',
    'renewals_only'
);


--
-- Name: alert_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.alert_status AS ENUM (
    'pending',
    'sent',
    'dismissed',
    'snoozed'
);


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'sales_rep'
);


--
-- Name: renewal_cycle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.renewal_cycle AS ENUM (
    'annual',
    'monthly',
    'biennial',
    'other'
);


--
-- Name: service_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.service_type AS ENUM (
    'domain',
    'hosting',
    'vps',
    'cdn',
    'mx',
    'ssl',
    'other'
);


--
-- Name: admin_can_manage_users(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_can_manage_users(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT has_role(_user_id, 'admin'::app_role)
$$;


--
-- Name: cleanup_expired_data(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_data() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE deleted_count INTEGER;
BEGIN
  DELETE FROM public.rate_limits WHERE created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % rate limits', deleted_count;
  
  DELETE FROM public.audit_logs WHERE created_at < NOW() - INTERVAL '1 year';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % audit logs', deleted_count;
  
  DELETE FROM public.meeting_notes WHERE id IN (
    SELECT mn.id FROM public.meeting_notes mn JOIN public.profiles p ON mn.user_id = p.id
    WHERE mn.created_at < NOW() - (COALESCE(p.retention_days, 30) || ' days')::INTERVAL
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % meeting notes', deleted_count;
END;
$$;


--
-- Name: get_google_access_token(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_google_access_token(_user_id uuid) RETURNS TABLE(access_token text, expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() != _user_id AND current_user != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY SELECT google_access_token, google_token_expires_at FROM public.profiles WHERE id = _user_id;
END;
$$;


--
-- Name: get_google_token_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_google_token_status(_user_id uuid) RETURNS TABLE(is_connected boolean, is_expired boolean, expires_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 
    google_access_token IS NOT NULL as is_connected,
    CASE 
      WHEN google_token_expires_at IS NULL THEN false
      WHEN google_token_expires_at < NOW() THEN true
      ELSE false
    END as is_expired,
    google_token_expires_at as expires_at
  FROM public.profiles
  WHERE id = _user_id AND id = auth.uid()
$$;


--
-- Name: get_safe_profile(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_safe_profile(profile_id uuid) RETURNS TABLE(id uuid, name text, email text, timezone text, digest_hour integer, digest_email text, active boolean, retention_days integer, google_linked boolean, google_calendar_id text, google_calendar_summary text, google_calendar_timezone text, trello_linked boolean, allowed_email_domains jsonb, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id, name, email, timezone, digest_hour, digest_email, active, retention_days,
         google_linked, google_calendar_id, google_calendar_summary, google_calendar_timezone,
         trello_linked, allowed_email_domains, created_at, updated_at
  FROM public.profiles
  WHERE id = profile_id AND (auth.uid() = id OR has_role(auth.uid(), 'admin'::app_role));
$$;


--
-- Name: get_trello_credentials(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_trello_credentials(_user_id uuid) RETURNS TABLE(api_key text, api_token text, board_id text, list_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Get credentials from any admin user who has Trello configured
  RETURN QUERY 
  SELECT p.trello_api_key, p.trello_api_token, p.trello_board_id, p.trello_list_id
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'admin'::app_role 
    AND p.trello_linked = true
    AND p.trello_api_key IS NOT NULL
    AND p.trello_api_token IS NOT NULL
  LIMIT 1;
END;
$$;


--
-- Name: handle_admin_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_admin_role() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.email = 'mnunes.maciel@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name')
  );
  RETURN NEW;
END;
$$;


--
-- Name: handle_renewals_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_renewals_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--
-- Name: is_google_calendar_connected(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_google_calendar_connected(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT google_access_token IS NOT NULL
  FROM public.profiles
  WHERE id = _user_id AND id = auth.uid()
$$;


--
-- Name: log_audit_event(text, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_audit_event(_action text, _resource_type text, _resource_id uuid DEFAULT NULL::uuid, _metadata jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, metadata)
  VALUES (auth.uid(), _action, _resource_type, _resource_id, _metadata);
END;
$$;


--
-- Name: soft_delete_my_meeting_notes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.soft_delete_my_meeting_notes() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.meeting_notes
  SET deleted_at = NOW(), updated_at = NOW()
  WHERE user_id = auth.uid() AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.log_audit_event(
    'soft_delete_notes',
    'meeting_notes',
    NULL,
    jsonb_build_object('count', v_count)
  );

  RETURN v_count;
END;
$$;


--
-- Name: update_oauth_tokens(uuid, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_oauth_tokens(_user_id uuid, _google_access_token text, _google_refresh_token text, _google_token_expires_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() != _user_id AND current_user != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.profiles
  SET google_access_token = _google_access_token, google_refresh_token = _google_refresh_token,
      google_token_expires_at = _google_token_expires_at, updated_at = NOW()
  WHERE id = _user_id;
  PERFORM public.log_audit_event('oauth_tokens_updated', 'profiles', _user_id, jsonb_build_object('provider', 'google'));
END;
$$;


--
-- Name: update_trello_config(uuid, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_trello_config(_user_id uuid, _api_key text, _api_token text, _board_id text, _board_name text, _list_id text, _list_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() != _user_id AND current_user != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  UPDATE public.profiles
  SET 
    trello_api_key = _api_key,
    trello_api_token = _api_token,
    trello_board_id = _board_id,
    trello_board_name = _board_name,
    trello_list_id = _list_id,
    trello_list_name = _list_name,
    trello_linked = true,
    updated_at = NOW()
  WHERE id = _user_id;
  
  PERFORM public.log_audit_event(
    'trello_connected',
    'profiles',
    _user_id,
    jsonb_build_object('board_name', _board_name, 'list_name', _list_name)
  );
END;
$$;


SET default_table_access_method = heap;

--
-- Name: alert_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    alert_id uuid NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    renewal_id uuid NOT NULL,
    alert_date date NOT NULL,
    status public.alert_status DEFAULT 'pending'::public.alert_status NOT NULL,
    sent_at timestamp with time zone,
    snoozed_until date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: api_key_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_key_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    action text NOT NULL,
    key_name text NOT NULL,
    service_name text NOT NULL,
    result text,
    error_message text,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT api_key_audit_logs_action_check CHECK ((action = ANY (ARRAY['viewed'::text, 'edited'::text, 'validated'::text, 'revealed'::text])))
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid,
    ip_address inet,
    user_agent text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    attendees jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'draft'::text,
    external_id text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_events_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'created'::text, 'error'::text]))),
    CONSTRAINT check_event_duration CHECK ((end_time > start_time)),
    CONSTRAINT check_event_not_too_far CHECK ((start_time < (now() + '5 years'::interval))),
    CONSTRAINT check_status_enum CHECK ((status = ANY (ARRAY['draft'::text, 'creating'::text, 'created'::text, 'failed'::text]))),
    CONSTRAINT check_title_length CHECK (((length(title) >= 1) AND (length(title) <= 300)))
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    active boolean DEFAULT true NOT NULL,
    notes text
);


--
-- Name: department_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    department_id uuid NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    filename text NOT NULL,
    mime_type text NOT NULL,
    storage_path text NOT NULL,
    file_size integer,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    user_id uuid NOT NULL,
    audience text NOT NULL,
    subject text NOT NULL,
    body_md text NOT NULL,
    recipients jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'draft'::text,
    external_id text,
    error_message text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_body_length CHECK (((length(body_md) >= 1) AND (length(body_md) <= 100000))),
    CONSTRAINT check_status_enum CHECK ((status = ANY (ARRAY['draft'::text, 'sending'::text, 'sent'::text, 'failed'::text]))),
    CONSTRAINT check_subject_length CHECK (((length(subject) >= 1) AND (length(subject) <= 500))),
    CONSTRAINT email_actions_audience_check CHECK ((audience = ANY (ARRAY['client'::text, 'finance'::text, 'tech'::text, 'sales'::text, 'support'::text, 'management'::text, 'custom'::text, 'internal'::text]))),
    CONSTRAINT email_actions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'error'::text])))
);


--
-- Name: email_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email_action_id uuid,
    event_type text NOT NULL,
    recipient_email text NOT NULL,
    event_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    external_id text,
    user_id uuid,
    CONSTRAINT email_events_event_type_check CHECK ((event_type = ANY (ARRAY['sent'::text, 'delivered'::text, 'opened'::text, 'clicked'::text, 'bounced'::text, 'complained'::text, 'failed'::text])))
);


--
-- Name: extractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extractions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    service_id uuid,
    extracted_data jsonb NOT NULL,
    confidence numeric(3,2),
    evidence text,
    quality_score numeric(3,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meeting_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    language text NOT NULL,
    sentiment text NOT NULL,
    sentiment_confidence numeric(3,2),
    transcript_url text,
    transcript_text text NOT NULL,
    summary text NOT NULL,
    customer_name text,
    customer_company text,
    meeting_datetime timestamp with time zone,
    meeting_duration_min integer,
    participants jsonb DEFAULT '[]'::jsonb,
    intents jsonb DEFAULT '[]'::jsonb,
    risks jsonb DEFAULT '[]'::jsonb,
    raw_llm_output jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sales_rep_name text,
    deleted_at timestamp with time zone,
    CONSTRAINT check_language_code CHECK ((language ~ '^[a-z]{2}(-[A-Z]{2})?$'::text)),
    CONSTRAINT check_summary_length CHECK (((length(summary) >= 1) AND (length(summary) <= 10000))),
    CONSTRAINT check_transcript_length CHECK (((length(transcript_text) >= 10) AND (length(transcript_text) <= 1000000))),
    CONSTRAINT meeting_notes_language_check CHECK ((language = ANY (ARRAY['pt'::text, 'es'::text, 'ca'::text, 'fr'::text, 'en'::text]))),
    CONSTRAINT meeting_notes_sentiment_check CHECK ((sentiment = ANY (ARRAY['positive'::text, 'neutral'::text, 'negative'::text]))),
    CONSTRAINT meeting_notes_sentiment_confidence_check CHECK (((sentiment_confidence >= (0)::numeric) AND (sentiment_confidence <= (1)::numeric)))
);


--
-- Name: oauth_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    state_token text NOT NULL,
    code_verifier text NOT NULL,
    provider text DEFAULT 'google'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    name text,
    timezone text,
    digest_email text,
    digest_hour integer DEFAULT 19,
    google_linked boolean DEFAULT false,
    trello_linked boolean DEFAULT false,
    retention_days integer DEFAULT 30,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    google_access_token text,
    google_refresh_token text,
    google_calendar_id text DEFAULT 'primary'::text,
    google_token_expires_at timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    allowed_email_domains jsonb DEFAULT '[]'::jsonb,
    resend_webhook_secret text,
    google_calendar_summary text,
    google_calendar_timezone text DEFAULT 'Europe/Lisbon'::text,
    trello_api_key text,
    trello_api_token text,
    trello_board_id text,
    trello_board_name text,
    trello_list_id text,
    trello_list_name text,
    access_type public.access_type DEFAULT 'full'::public.access_type NOT NULL,
    CONSTRAINT profiles_digest_hour_check CHECK (((digest_hour >= 0) AND (digest_hour <= 23)))
);


--
-- Name: providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    ip_address inet,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: renewal_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.renewal_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    default_alert_offset_days integer DEFAULT 45 NOT NULL,
    default_recipients text[] DEFAULT ARRAY[]::text[],
    email_template_subject text,
    email_template_body text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: renewals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.renewals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid NOT NULL,
    renewal_date date NOT NULL,
    cycle public.renewal_cycle DEFAULT 'annual'::public.renewal_cycle NOT NULL,
    amount numeric(10,2),
    currency text DEFAULT 'EUR'::text,
    notes text,
    renewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: security_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    description text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    service_type public.service_type NOT NULL,
    service_name text NOT NULL,
    client_id uuid,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trello_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trello_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    user_id uuid,
    title text NOT NULL,
    description text,
    due_date timestamp with time zone,
    labels jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'draft'::text,
    external_id text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trello_cards_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'created'::text, 'error'::text])))
);

ALTER TABLE ONLY public.trello_cards REPLICA IDENTITY FULL;


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);


--
-- Name: alert_recipients alert_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_recipients
    ADD CONSTRAINT alert_recipients_pkey PRIMARY KEY (id);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: api_key_audit_logs api_key_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_key_audit_logs
    ADD CONSTRAINT api_key_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: clients clients_name_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_name_user_id_key UNIQUE (name, user_id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: department_emails department_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_emails
    ADD CONSTRAINT department_emails_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: email_actions email_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_actions
    ADD CONSTRAINT email_actions_pkey PRIMARY KEY (id);


--
-- Name: email_events email_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_pkey PRIMARY KEY (id);


--
-- Name: extractions extractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extractions
    ADD CONSTRAINT extractions_pkey PRIMARY KEY (id);


--
-- Name: meeting_notes meeting_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_notes
    ADD CONSTRAINT meeting_notes_pkey PRIMARY KEY (id);


--
-- Name: oauth_states oauth_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_states
    ADD CONSTRAINT oauth_states_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: providers providers_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.providers
    ADD CONSTRAINT providers_name_key UNIQUE (name);


--
-- Name: providers providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.providers
    ADD CONSTRAINT providers_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);


--
-- Name: renewal_settings renewal_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.renewal_settings
    ADD CONSTRAINT renewal_settings_pkey PRIMARY KEY (id);


--
-- Name: renewal_settings renewal_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.renewal_settings
    ADD CONSTRAINT renewal_settings_user_id_key UNIQUE (user_id);


--
-- Name: renewals renewals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.renewals
    ADD CONSTRAINT renewals_pkey PRIMARY KEY (id);


--
-- Name: security_config security_config_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_config
    ADD CONSTRAINT security_config_key_key UNIQUE (key);


--
-- Name: security_config security_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_config
    ADD CONSTRAINT security_config_pkey PRIMARY KEY (id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: trello_cards trello_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trello_cards
    ADD CONSTRAINT trello_cards_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: idx_alert_recipients_alert_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alert_recipients_alert_id ON public.alert_recipients USING btree (alert_id);


--
-- Name: idx_alerts_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_date ON public.alerts USING btree (alert_date);


--
-- Name: idx_alerts_renewal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_renewal_id ON public.alerts USING btree (renewal_id);


--
-- Name: idx_alerts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_status ON public.alerts USING btree (status);


--
-- Name: idx_api_key_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_key_audit_logs_created_at ON public.api_key_audit_logs USING btree (created_at DESC);


--
-- Name: idx_api_key_audit_logs_key_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_key_audit_logs_key_name ON public.api_key_audit_logs USING btree (key_name);


--
-- Name: idx_api_key_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_key_audit_logs_user_id ON public.api_key_audit_logs USING btree (user_id);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_calendar_events_note_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_events_note_id ON public.calendar_events USING btree (note_id);


--
-- Name: idx_clients_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_active ON public.clients USING btree (active);


--
-- Name: idx_clients_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_name ON public.clients USING btree (name);


--
-- Name: idx_clients_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_user_active ON public.clients USING btree (user_id, active);


--
-- Name: idx_clients_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_user_id ON public.clients USING btree (user_id);


--
-- Name: idx_documents_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_user_id ON public.documents USING btree (user_id);


--
-- Name: idx_email_actions_note_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_actions_note_id ON public.email_actions USING btree (note_id);


--
-- Name: idx_email_actions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_actions_status ON public.email_actions USING btree (status);


--
-- Name: idx_email_events_action_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_events_action_id ON public.email_events USING btree (email_action_id);


--
-- Name: idx_email_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_events_created_at ON public.email_events USING btree (created_at DESC);


--
-- Name: idx_email_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_events_type ON public.email_events USING btree (event_type);


--
-- Name: idx_email_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_events_user_id ON public.email_events USING btree (user_id);


--
-- Name: idx_extractions_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extractions_document_id ON public.extractions USING btree (document_id);


--
-- Name: idx_extractions_service_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extractions_service_id ON public.extractions USING btree (service_id);


--
-- Name: idx_meeting_notes_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_notes_created_at ON public.meeting_notes USING btree (created_at DESC);


--
-- Name: idx_meeting_notes_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_notes_deleted_at ON public.meeting_notes USING btree (deleted_at);


--
-- Name: idx_meeting_notes_sentiment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_notes_sentiment ON public.meeting_notes USING btree (sentiment);


--
-- Name: idx_meeting_notes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_notes_user_id ON public.meeting_notes USING btree (user_id);


--
-- Name: idx_oauth_states_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_states_expires ON public.oauth_states USING btree (expires_at);


--
-- Name: idx_oauth_states_user_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_states_user_state ON public.oauth_states USING btree (user_id, state_token);


--
-- Name: idx_profiles_access_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_access_type ON public.profiles USING btree (access_type);


--
-- Name: idx_profiles_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_active ON public.profiles USING btree (active);


--
-- Name: idx_providers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_providers_name ON public.providers USING btree (name);


--
-- Name: idx_rate_limits_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limits_ip ON public.rate_limits USING btree (ip_address, action, created_at);


--
-- Name: idx_rate_limits_user_action_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limits_user_action_time ON public.rate_limits USING btree (user_id, action, created_at DESC);


--
-- Name: idx_renewal_settings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_renewal_settings_user_id ON public.renewal_settings USING btree (user_id);


--
-- Name: idx_renewals_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_renewals_date ON public.renewals USING btree (renewal_date);


--
-- Name: idx_renewals_renewed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_renewals_renewed_at ON public.renewals USING btree (renewed_at);


--
-- Name: idx_renewals_service_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_renewals_service_id ON public.renewals USING btree (service_id);


--
-- Name: idx_services_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_client_id ON public.services USING btree (client_id);


--
-- Name: idx_services_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_provider_id ON public.services USING btree (provider_id);


--
-- Name: idx_services_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_type ON public.services USING btree (service_type);


--
-- Name: idx_services_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_user_id ON public.services USING btree (user_id);


--
-- Name: idx_trello_cards_note_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trello_cards_note_id ON public.trello_cards USING btree (note_id);


--
-- Name: calendar_events set_updated_at_calendar_events; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_calendar_events BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: email_actions set_updated_at_email_actions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_email_actions BEFORE UPDATE ON public.email_actions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: meeting_notes set_updated_at_meeting_notes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_meeting_notes BEFORE UPDATE ON public.meeting_notes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: profiles set_updated_at_profiles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: trello_cards set_updated_at_trello_cards; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_trello_cards BEFORE UPDATE ON public.trello_cards FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: departments trg_departments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: alerts update_alerts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON public.alerts FOR EACH ROW EXECUTE FUNCTION public.handle_renewals_updated_at();


--
-- Name: clients update_clients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.handle_renewals_updated_at();


--
-- Name: providers update_providers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON public.providers FOR EACH ROW EXECUTE FUNCTION public.handle_renewals_updated_at();


--
-- Name: renewal_settings update_renewal_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_renewal_settings_updated_at BEFORE UPDATE ON public.renewal_settings FOR EACH ROW EXECUTE FUNCTION public.handle_renewals_updated_at();


--
-- Name: renewals update_renewals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_renewals_updated_at BEFORE UPDATE ON public.renewals FOR EACH ROW EXECUTE FUNCTION public.handle_renewals_updated_at();


--
-- Name: services update_services_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.handle_renewals_updated_at();


--
-- Name: alert_recipients alert_recipients_alert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_recipients
    ADD CONSTRAINT alert_recipients_alert_id_fkey FOREIGN KEY (alert_id) REFERENCES public.alerts(id) ON DELETE CASCADE;


--
-- Name: alerts alerts_renewal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_renewal_id_fkey FOREIGN KEY (renewal_id) REFERENCES public.renewals(id) ON DELETE CASCADE;


--
-- Name: api_key_audit_logs api_key_audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_key_audit_logs
    ADD CONSTRAINT api_key_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: calendar_events calendar_events_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.meeting_notes(id) ON DELETE CASCADE;


--
-- Name: calendar_events calendar_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: clients clients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: department_emails department_emails_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_emails
    ADD CONSTRAINT department_emails_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: documents documents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: email_actions email_actions_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_actions
    ADD CONSTRAINT email_actions_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.meeting_notes(id) ON DELETE CASCADE;


--
-- Name: email_actions email_actions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_actions
    ADD CONSTRAINT email_actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: email_events email_events_email_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_email_action_id_fkey FOREIGN KEY (email_action_id) REFERENCES public.email_actions(id) ON DELETE CASCADE;


--
-- Name: email_events email_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: extractions extractions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extractions
    ADD CONSTRAINT extractions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: extractions extractions_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extractions
    ADD CONSTRAINT extractions_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;


--
-- Name: meeting_notes meeting_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_notes
    ADD CONSTRAINT meeting_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: oauth_states oauth_states_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_states
    ADD CONSTRAINT oauth_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: rate_limits rate_limits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: renewal_settings renewal_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.renewal_settings
    ADD CONSTRAINT renewal_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: renewals renewals_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.renewals
    ADD CONSTRAINT renewals_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: security_config security_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_config
    ADD CONSTRAINT security_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: services services_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: services services_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: services services_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: trello_cards trello_cards_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trello_cards
    ADD CONSTRAINT trello_cards_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.meeting_notes(id) ON DELETE CASCADE;


--
-- Name: trello_cards trello_cards_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trello_cards
    ADD CONSTRAINT trello_cards_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles Admins can create roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can create roles" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: email_events Admins can delete email events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete email events" ON public.email_events FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: rate_limits Admins can delete rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete rate limits" ON public.rate_limits FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can delete roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: security_config Admins can delete security config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete security config" ON public.security_config FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: security_config Admins can insert security config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert security config" ON public.security_config FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can update roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: security_config Admins can update security config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update security config" ON public.security_config FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles Admins can update user settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update user settings" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: api_key_audit_logs Admins can view all API key audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all API key audit logs" ON public.api_key_audit_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: meeting_notes Admins can view all notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all notes" ON public.meeting_notes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can view all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: audit_logs Admins can view audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles Admins can view profile metadata only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view profile metadata only" ON public.profiles FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (id <> auth.uid())));


--
-- Name: security_config Admins can view security config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view security config" ON public.security_config FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: meeting_notes Admins view all notes including deleted; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view all notes including deleted" ON public.meeting_notes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: calendar_events Authenticated users can create own calendar events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create own calendar events" ON public.calendar_events FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: email_actions Authenticated users can create own email actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create own email actions" ON public.email_actions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: email_events Authenticated users can create own email events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create own email events" ON public.email_events FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: meeting_notes Authenticated users can create own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create own notes" ON public.meeting_notes FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: providers Authenticated users can insert providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert providers" ON public.providers FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: providers Authenticated users can view providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view providers" ON public.providers FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: api_key_audit_logs Service can insert API key audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service can insert API key audit logs" ON public.api_key_audit_logs FOR INSERT WITH CHECK (true);


--
-- Name: audit_logs Service can insert audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service can insert audit logs" ON public.audit_logs FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: oauth_states Service role can delete OAuth states; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can delete OAuth states" ON public.oauth_states FOR DELETE TO service_role USING (true);


--
-- Name: rate_limits Service role can delete rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can delete rate limits" ON public.rate_limits FOR DELETE TO service_role USING (true);


--
-- Name: email_events Service role can insert email events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert email events" ON public.email_events FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: rate_limits Service role can insert rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert rate limits" ON public.rate_limits FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: oauth_states Service role can read OAuth states; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can read OAuth states" ON public.oauth_states FOR SELECT TO service_role USING (true);


--
-- Name: alert_recipients Users can create own alert recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own alert recipients" ON public.alert_recipients FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.alerts a
     JOIN public.renewals r ON ((r.id = a.renewal_id)))
     JOIN public.services s ON ((s.id = r.service_id)))
  WHERE ((a.id = alert_recipients.alert_id) AND (s.user_id = auth.uid())))));


--
-- Name: alerts Users can create own alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own alerts" ON public.alerts FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.renewals r
     JOIN public.services s ON ((s.id = r.service_id)))
  WHERE ((r.id = alerts.renewal_id) AND (s.user_id = auth.uid())))));


--
-- Name: departments Users can create own departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own departments" ON public.departments FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: extractions Users can create own extractions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own extractions" ON public.extractions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.documents
  WHERE ((documents.id = extractions.document_id) AND (documents.user_id = auth.uid())))));


--
-- Name: rate_limits Users can create own rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own rate limits" ON public.rate_limits FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: renewal_settings Users can create own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own settings" ON public.renewal_settings FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: trello_cards Users can create own trello cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own trello cards" ON public.trello_cards FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: department_emails Users can delete department emails for own departments or admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete department emails for own departments or admin" ON public.department_emails FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.departments d
  WHERE ((d.id = department_emails.department_id) AND ((d.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))))));


--
-- Name: alert_recipients Users can delete own alert recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own alert recipients" ON public.alert_recipients FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ((public.alerts a
     JOIN public.renewals r ON ((r.id = a.renewal_id)))
     JOIN public.services s ON ((s.id = r.service_id)))
  WHERE ((a.id = alert_recipients.alert_id) AND (s.user_id = auth.uid())))));


--
-- Name: alerts Users can delete own alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own alerts" ON public.alerts FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (public.renewals r
     JOIN public.services s ON ((s.id = r.service_id)))
  WHERE ((r.id = alerts.renewal_id) AND (s.user_id = auth.uid())))));


--
-- Name: calendar_events Users can delete own calendar events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own calendar events" ON public.calendar_events FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: departments Users can delete own departments or admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own departments or admins" ON public.departments FOR DELETE USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: email_actions Users can delete own email actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own email actions" ON public.email_actions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: email_events Users can delete own email events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own email events" ON public.email_events FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: extractions Users can delete own extractions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own extractions" ON public.extractions FOR DELETE USING (((EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = extractions.document_id) AND (d.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.services s
  WHERE ((s.id = extractions.service_id) AND (s.user_id = auth.uid()))))));


--
-- Name: meeting_notes Users can delete own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own notes" ON public.meeting_notes FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: trello_cards Users can delete own trello cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own trello cards" ON public.trello_cards FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: department_emails Users can insert department emails for own departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert department emails for own departments" ON public.department_emails FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.departments d
  WHERE ((d.id = department_emails.department_id) AND ((d.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))))));


--
-- Name: oauth_states Users can insert own OAuth states; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own OAuth states" ON public.oauth_states FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: oauth_states Users can read own OAuth states; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own OAuth states" ON public.oauth_states FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: meeting_notes Users can soft-delete own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can soft-delete own notes" ON public.meeting_notes FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK (((auth.uid() = user_id) AND (deleted_at IS NOT NULL)));


--
-- Name: department_emails Users can update department emails for own departments or admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update department emails for own departments or admin" ON public.department_emails FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.departments d
  WHERE ((d.id = department_emails.department_id) AND ((d.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))))));


--
-- Name: alerts Users can update own alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own alerts" ON public.alerts FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (public.renewals r
     JOIN public.services s ON ((s.id = r.service_id)))
  WHERE ((r.id = alerts.renewal_id) AND (s.user_id = auth.uid())))));


--
-- Name: calendar_events Users can update own calendar events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own calendar events" ON public.calendar_events FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: departments Users can update own departments or admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own departments or admins" ON public.departments FOR UPDATE USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: email_actions Users can update own email actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own email actions" ON public.email_actions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: meeting_notes Users can update own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notes" ON public.meeting_notes FOR UPDATE USING (((auth.uid() = user_id) AND (deleted_at IS NULL))) WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id));


--
-- Name: renewal_settings Users can update own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own settings" ON public.renewal_settings FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: trello_cards Users can update own trello cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own trello cards" ON public.trello_cards FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: extractions Users can view extractions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view extractions" ON public.extractions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.access_type = 'full'::public.access_type) OR (profiles.access_type = 'renewals_only'::public.access_type))))));


--
-- Name: alert_recipients Users can view own alert recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own alert recipients" ON public.alert_recipients FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((public.alerts a
     JOIN public.renewals r ON ((r.id = a.renewal_id)))
     JOIN public.services s ON ((s.id = r.service_id)))
  WHERE ((a.id = alert_recipients.alert_id) AND (s.user_id = auth.uid())))));


--
-- Name: alerts Users can view own alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own alerts" ON public.alerts FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.renewals r
     JOIN public.services s ON ((s.id = r.service_id)))
  WHERE ((r.id = alerts.renewal_id) AND (s.user_id = auth.uid())))));


--
-- Name: profiles Users can view own complete profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own complete profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- Name: email_events Users can view own email events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own email events" ON public.email_events FOR SELECT USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: rate_limits Users can view own rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own rate limits" ON public.rate_limits FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: renewal_settings Users can view own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own settings" ON public.renewal_settings FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: meeting_notes Users view own non-deleted notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own non-deleted notes" ON public.meeting_notes FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND (deleted_at IS NULL)));


--
-- Name: calendar_events Users view own or admins view all calendar events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own or admins view all calendar events" ON public.calendar_events FOR SELECT USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR (user_id IS NULL)));


--
-- Name: department_emails Users view own or admins view all department emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own or admins view all department emails" ON public.department_emails FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.departments d
  WHERE ((d.id = department_emails.department_id) AND ((d.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))))));


--
-- Name: departments Users view own or admins view all departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own or admins view all departments" ON public.departments FOR SELECT USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: email_actions Users view own or admins view all email actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own or admins view all email actions" ON public.email_actions FOR SELECT USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR (user_id IS NULL)));


--
-- Name: trello_cards Users view own or admins view all trello cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own or admins view all trello cards" ON public.trello_cards FOR SELECT USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR (user_id IS NULL)));


--
-- Name: clients Users with renewals access can create clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users with renewals access can create clients" ON public.clients FOR INSERT WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.access_type = 'full'::public.access_type) OR (profiles.access_type = 'renewals_only'::public.access_type)))))));


--
-- Name: documents Users with renewals access can create documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users with renewals access can create documents" ON public.documents FOR INSERT WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.access_type = 'full'::public.access_type) OR (profiles.access_type = 'renewals_only'::public.access_type)))))));


--
-- Name: renewals Users with renewals access can create renewals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users with renewals access can create renewals" ON public.renewals FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.services s
     JOIN public.profiles p ON ((p.id = s.user_id)))
  WHERE ((s.id = renewals.service_id) AND (s.user_id = auth.uid()) AND ((p.access_type = 'full'::public.access_type) OR (p.access_type = 'renewals_only'::public.access_type))))));


--
-- Name: services Users with renewals access can create services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users with renewals access can create services" ON public.services FOR INSERT WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.access_type = 'full'::public.access_type) OR (profiles.access_type = 'renewals_only'::public.access_type)))))));


--
-- Name: clients Users with renewals access can delete clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users with renewals access can delete clients" ON public.clients FOR DELETE USING (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.access_type = 'full'::public.access_type) OR (profiles.access_type = 'renewals_only'::public.access_type)))))));


--
-- Name: documents Users with renewals access can delete documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users with renewals access can delete documents" ON public.documents FOR DELETE USING (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.access_type = 'full'::public.access_type) OR (profiles.access_type = 'renewals_only'::public.access_type)))))));


--
-- Name: renewals Users with renewals access can delete renewals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users with renewals access can delete renewals" ON public.renewals FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (public.services s
     JOIN public.profiles p ON ((p.id = s.user_id)))
  WHERE ((s.id = renewals.service_id) AND (s.user_id = auth.uid()) AND ((p.access_type = 'full'::public.access_type) OR (p.access_type = 'renewals_only'::public.access_type))))));


--
-- Name: services Users with renewals access can delete services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users with renewals access can delete services" ON public.services FOR DELETE USING (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.access_type = 'full'::public.access_type) OR (profiles.access_type = 'renewals_only'::public.access_type)))))));


--
-- Name: clients Users with renewals access can update clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users with renewals access can update clients" ON public.clients FOR UPDATE USING (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.access_type = 'full'::public.access_type) OR (profiles.access_type = 'renewals_only'::public.access_type)))))));


--
-- Name: renewals Users with renewals access can update renewals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users with renewals access can update renewals" ON public.renewals FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (public.services s
     JOIN public.profiles p ON ((p.id = s.user_id)))
  WHERE ((s.id = renewals.service_id) AND (s.user_id = auth.uid()) AND ((p.access_type = 'full'::public.access_type) OR (p.access_type = 'renewals_only'::public.access_type))))));


--
-- Name: services Users with renewals access can update services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users with renewals access can update services" ON public.services FOR UPDATE USING (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.access_type = 'full'::public.access_type) OR (profiles.access_type = 'renewals_only'::public.access_type)))))));


--
-- Name: clients Users with renewals access can view clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users with renewals access can view clients" ON public.clients FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.access_type = 'full'::public.access_type) OR (profiles.access_type = 'renewals_only'::public.access_type))))));


--
-- Name: documents Users with renewals access can view documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users with renewals access can view documents" ON public.documents FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.access_type = 'full'::public.access_type) OR (profiles.access_type = 'renewals_only'::public.access_type))))));


--
-- Name: renewals Users with renewals access can view renewals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users with renewals access can view renewals" ON public.renewals FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.access_type = 'full'::public.access_type) OR (profiles.access_type = 'renewals_only'::public.access_type))))));


--
-- Name: services Users with renewals access can view services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users with renewals access can view services" ON public.services FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.access_type = 'full'::public.access_type) OR (profiles.access_type = 'renewals_only'::public.access_type))))));


--
-- Name: alert_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.alert_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: api_key_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_key_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: department_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.department_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: email_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: email_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

--
-- Name: extractions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extractions ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meeting_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: oauth_states; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: providers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: renewal_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.renewal_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: renewals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.renewals ENABLE ROW LEVEL SECURITY;

--
-- Name: security_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.security_config ENABLE ROW LEVEL SECURITY;

--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

--
-- Name: trello_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trello_cards ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


