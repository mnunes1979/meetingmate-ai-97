-- Create table to store API keys securely (managed by admins)
CREATE TABLE public.api_keys_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name text NOT NULL UNIQUE,
  key_value text NOT NULL,
  service_name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'Other',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.api_keys_config ENABLE ROW LEVEL SECURITY;

-- Only admins can view API keys
CREATE POLICY "Admins can view API keys"
ON public.api_keys_config
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert API keys
CREATE POLICY "Admins can insert API keys"
ON public.api_keys_config
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update API keys
CREATE POLICY "Admins can update API keys"
ON public.api_keys_config
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete API keys
CREATE POLICY "Admins can delete API keys"
ON public.api_keys_config
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_api_keys_config_updated_at
BEFORE UPDATE ON public.api_keys_config
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Function to get API key value securely (for edge functions)
CREATE OR REPLACE FUNCTION public.get_api_key_value(p_key_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value text;
BEGIN
  SELECT key_value INTO v_value
  FROM public.api_keys_config
  WHERE key_name = p_key_name;
  
  RETURN v_value;
END;
$$;

-- Insert default key configurations (without values - to be filled by admin)
-- These are placeholders that show what keys are needed
INSERT INTO public.api_keys_config (key_name, service_name, description, category, key_value) VALUES
('OPENAI_API_KEY', 'OpenAI', 'Chave API OpenAI para transcrição e análise de reuniões', 'AI Services', ''),
('RESEND_API_KEY', 'Resend', 'Chave API Resend para envio de emails', 'Email Services', ''),
('RESEND_FROM', 'Resend', 'Email de remetente padrão para Resend', 'Email Services', ''),
('RESEND_WEBHOOK_SECRET', 'Resend', 'Webhook secret para verificação de eventos Resend', 'Email Services', '')
ON CONFLICT (key_name) DO NOTHING;