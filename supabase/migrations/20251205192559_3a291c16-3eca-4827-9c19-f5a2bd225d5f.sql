-- Add Deepgram API key to api_keys_config
INSERT INTO public.api_keys_config (key_name, service_name, description, category, key_value)
VALUES (
  'DEEPGRAM_API_KEY', 
  'Deepgram', 
  'Chave da API Deepgram para transcrição de áudio (Gravar Nota de Reunião)',
  'AI Services',
  ''
)
ON CONFLICT (key_name) DO NOTHING;