import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * Get API key from database FIRST (admin UI managed), then fallback to environment variable.
 * This ensures admin-configured keys take priority over Lovable secrets.
 */
export async function getApiKey(keyName: string): Promise<string | null> {
  // First check database (admin UI managed keys take priority)
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabaseAdmin
      .from('api_keys_config')
      .select('key_value')
      .eq('key_name', keyName)
      .single();

    if (!error && data && data.key_value && data.key_value.length > 0) {
      console.log(`[getApiKey] Using ${keyName} from database`);
      return data.key_value;
    }
  } catch (error) {
    console.error(`[getApiKey] Error fetching ${keyName} from database:`, error);
  }

  // Fall back to environment variable (Lovable secrets)
  const envValue = Deno.env.get(keyName);
  if (envValue && envValue.length > 0) {
    console.log(`[getApiKey] Using ${keyName} from environment variable`);
    return envValue;
  }

  console.log(`[getApiKey] API key ${keyName} not found`);
  return null;
}

/**
 * Get multiple API keys at once (more efficient for multiple keys)
 */
export async function getApiKeys(keyNames: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};

  // First check environment variables
  for (const keyName of keyNames) {
    const envValue = Deno.env.get(keyName);
    result[keyName] = envValue && envValue.length > 0 ? envValue : null;
  }

  // Check database for any missing keys
  const missingKeys = keyNames.filter(k => !result[k]);
  
  if (missingKeys.length > 0) {
    try {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const { data, error } = await supabaseAdmin
        .from('api_keys_config')
        .select('key_name, key_value')
        .in('key_name', missingKeys);

      if (!error && data) {
        for (const row of data) {
          if (row.key_value && row.key_value.length > 0) {
            result[row.key_name] = row.key_value;
          }
        }
      }
    } catch (error) {
      console.error('Error fetching API keys from database:', error);
    }
  }

  return result;
}
