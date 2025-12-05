import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractionRequest {
  document_id: string;
  isTabular?: boolean;
}

interface ExtractionResult {
  provider: string | null;
  service_type: 'domain' | 'hosting' | 'vps' | 'cdn' | 'mx' | 'ssl' | 'other';
  service_name: string | null;
  renewal_date: string | null;
  cycle: 'annual' | 'monthly' | 'biennial' | 'other' | null;
  client_name: string | null;
  confidence: number;
  evidence: string;
}

// Lightweight CSV parser fallback (no AI) for robustness and to avoid timeouts
function localParseCsv(csvText: string, providerName: string) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { services: [] };
  const first = lines[0];
  const candidates = [',', ';', '\t', '|'];
  let delim = ','; let max = -1;
  for (const d of candidates) {
    const c = (first.match(new RegExp(`\\${d}`, 'g')) || []).length;
    if (c > max) { max = c; delim = d; }
  }
  const headers = first.split(delim).map((h) => h.trim().toLowerCase());
  console.info('CSV Headers detected:', headers);
  
  const idx = (alts: string[]) => {
    for (const a of alts) {
      const i = headers.findIndex((h) => h.includes(a));
      if (i !== -1) {
        console.info(`Found column '${a}' at index ${i}`);
        return i;
      }
    }
    return -1;
  };
  const idxName = idx(['domain','domínio','dominio','service','serviço','servico','nome','host']);
  const idxType = idx(['type','tipo','serviço','servico','categoria','classe']);
  // CRITICAL: Check for expiration date columns with priority (including hyphenated variants)
  const idxDate = idx([
    'expiration-date','expiration_date','expiration','expire-date','expire_date','expires','expire',
    'renewal-date','renewal_date','renewal','renew-date','renew_date','renew',
    'data-expiracao','data_expiracao','data-de-expiracao','data_de_expiracao','expiracao',
    'data-renovacao','data_renovacao','data-de-renovacao','data_de_renovacao','renovacao',
    'vencimento','venc','valid','data'
  ]);
  const idxClient = idx(['client','cliente','empresa','company','org']);
  const idxCycle = idx(['cycle','ciclo','period','período','billing','frequ']);
  const mapType = (v: string) => {
    const s = (v || '').toLowerCase();
    if (/dns|zona|domain|domínio|dominio/.test(s)) return 'domain';
    if (/aloj|host(ing)?/.test(s)) return 'hosting';
    if (/vps|virtual/.test(s)) return 'vps';
    if (/cdn/.test(s)) return 'cdn';
    if (/(ssl|certificate)/.test(s)) return 'ssl';
    if (/(mx|mail|email)/.test(s)) return 'mx';
    return 'other';
  };
  const mapCycle = (v: string) => {
    const s = (v || '').toLowerCase();
    if (/(annual|anual|year)/.test(s)) return 'annual';
    if (/(mensal|monthly|month)/.test(s)) return 'monthly';
    if (/(bienal|biennial|2\s*years)/.test(s)) return 'biennial';
    return 'other';
  };
  const normDate = (v?: string | null) => {
    if (!v) return null;
    const s = v.trim();
    console.info(`Parsing date from: "${s}"`);
    
    // CRITICAL: Extract date from text that may contain prefixes like "autorenew_service_expiration_date 01/01/2026 01/01/2026"
    // or "Janeiro 2026 01/01/2026" or just "01/01/2026"
    
    // Strategy: Find ALL date patterns in the string and use the LAST valid one found
    let foundDate: string | null = null;
    
    // 1. Try to find DD/MM/YYYY (most common in OVH CSVs) - search entire string
    const ddmmyyyyPattern = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/g;
    let match;
    while ((match = ddmmyyyyPattern.exec(s)) !== null) {
      const day = match[1];
      const month = match[2];
      const year = match[3];
      // Basic validation
      if (parseInt(month) >= 1 && parseInt(month) <= 12 && parseInt(day) >= 1 && parseInt(day) <= 31) {
        foundDate = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
        console.info(`Found DD/MM/YYYY date: ${foundDate}`);
      }
    }
    
    if (foundDate) return foundDate;
    
    // 2. Try ISO 8601 with timestamp: 2029-09-04T14:10:23.117Z
    const isoTimestamp = /(\d{4})-(\d{2})-(\d{2})T[\d:\.]+Z?/;
    const isoMatch = s.match(isoTimestamp);
    if (isoMatch) {
      foundDate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
      console.info(`Found ISO timestamp date: ${foundDate}`);
      return foundDate;
    }
    
    // 3. Try YYYY-MM-DD or YYYY/MM/DD format
    const yyyymmddPattern = /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/;
    const yyyyMatch = s.match(yyyymmddPattern);
    if (yyyyMatch) {
      foundDate = `${yyyyMatch[1]}-${yyyyMatch[2].padStart(2,'0')}-${yyyyMatch[3].padStart(2,'0')}`;
      console.info(`Found YYYY-MM-DD date: ${foundDate}`);
      return foundDate;
    }
    
    console.warn(`Failed to parse any date from: "${s}"`);
    return null;
  };
  const services: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    // naive CSV splitter with basic quote handling
    const cells: string[] = []; let cur = ''; let inQ = false;
    for (let j = 0; j < raw.length; j++) {
      const ch = raw[j];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === delim && !inQ) { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    const name = idxName !== -1 ? cells[idxName]?.trim() : undefined;
    if (!name) continue;
    const typeRaw = idxType !== -1 ? cells[idxType] : '';
    const dateRaw = idxDate !== -1 ? cells[idxDate] : '';
    const clientRaw = idxClient !== -1 ? cells[idxClient] : '';
    const cycleRaw = idxCycle !== -1 ? cells[idxCycle] : '';
    services.push({
      provider: providerName || null,
      service_name: name,
      service_type: mapType(typeRaw || name),
      renewal_date: normDate(dateRaw || ''),
      cycle: mapCycle(cycleRaw || ''),
      client_name: clientRaw || null,
      confidence: 0.6,
      evidence: raw.slice(0, 500)
    });
  }
  return { services };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = tokenMatch?.[1];
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { document_id, isTabular }: ExtractionRequest = await req.json();

    console.log('Processing document:', document_id);

    // Fetch document from database
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', document_id)
      .maybeSingle();

    if (docError) {
      console.error('Database error:', docError);
      return new Response(
        JSON.stringify({ error: 'Database error', details: docError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!document) {
      return new Response(
        JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('renewals')
      .download(document.storage_path);

    if (downloadError) {
      console.error('Storage download error:', downloadError);
      return new Response(
        JSON.stringify({ error: 'Failed to download file', details: downloadError.message || 'Storage error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!fileData) {
      return new Response(
        JSON.stringify({ error: 'File data is empty' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let extractedText = '';
    let extractedServices: any = { services: [] };
    
    // Check if file is CSV
    const isCSV = document.mime_type.includes('csv') || 
                  document.mime_type.includes('text/csv') ||
                  document.filename.toLowerCase().endsWith('.csv');

    if (isCSV) {
      console.log('Processing CSV with AI:', document.filename);
      
      // Extract provider name from filename
      const providerName = document.filename
        .replace(/\.csv$/i, '')
        .replace(/[_-]/g, ' ')
        .trim();
      
      console.log('Provider from filename:', providerName);
      
      // Read CSV content
      const csvText = await fileData.text();
      console.log('CSV content length:', csvText.length);
      
      // Use OpenAI to intelligently parse and extract data from CSV
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s timeout

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are a data extraction expert. Extract service renewal data from CSV content.

**CRITICAL - EXPIRATION DATE IS THE MOST IMPORTANT FIELD:**
The CSV MUST have a column for expiration/renewal dates. This is CRITICAL for automated email alerts.
Check for columns named: expiration date, renewal date, expire date, expires, renew date, data de expiração, data renovação, vencimento, etc.

EXTRACTION RULES:
- Provider is always "${providerName}" (from the filename)
- Extract REAL data from the CSV rows, NEVER invent or generate examples
- **FIND THE EXPIRATION/RENEWAL DATE COLUMN** - check variations like: expiration_date, renewal_date, expire_date, expires, renew_date, data_expiracao, vencimento
- Parse dates in ANY format (DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY, etc.) to YYYY-MM-DD
- Detect column names in any language (Portuguese, English, Spanish, etc.)
- Map service types to: domain, hosting, vps, cdn, mx, ssl, other
- Map cycles to: annual, monthly, biennial, other
- If a field is missing or unclear, set it to null (except provider)
- Client name is optional - only extract if clearly present

SERVICE TYPE MAPPING:
- "Zonas DNS", "Zona DNS", "DNS Zone", "Domínio", "Domain" → domain
- "Alojamento web", "Hosting", "Web Hosting" → hosting  
- "Shared CDN", "CDN" → cdn
- "VPS", "Virtual Server" → vps
- "Certificado SSL", "SSL", "Certificate" → ssl
- "Email", "MX", "Mail" → mx
- Everything else → other

CYCLE MAPPING:
- "Todos os anos", "Annual", "Anual", "Yearly", "1 year" → annual
- "Mensal", "Monthly", "1 month" → monthly
- "Bienal", "Biennial", "2 years" → biennial
- "Nenhum", "None", "N/A" → other`
              },
              {
                role: 'user',
                content: `CRITICAL: Extract all services from this CSV. Focus on finding the EXPIRATION/RENEWAL DATE column - this is the most important field for email alerts.

Provider: "${providerName}"

CSV Content:
${csvText}`
              }
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'extract_csv_services',
                  description: 'Extract service data from CSV rows',
                  parameters: {
                    type: 'object',
                    properties: {
                      services: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            provider: { type: 'string', description: 'Always use the provider from filename' },
                            service_name: { type: 'string', description: 'Service/domain name from CSV' },
                            service_type: { type: 'string', enum: ['domain', 'hosting', 'vps', 'cdn', 'mx', 'ssl', 'other'], description: 'Normalized service type' },
                            renewal_date: { type: 'string', nullable: true, description: 'Date in YYYY-MM-DD format' },
                            cycle: { type: 'string', enum: ['annual', 'monthly', 'biennial', 'other'], description: 'Renewal cycle' },
                            client_name: { type: 'string', nullable: true, description: 'Client name if present' },
                            confidence: { type: 'number', description: 'Confidence 0-1' },
                            evidence: { type: 'string', description: 'Source data excerpt' }
                          },
                          required: ['provider', 'service_name', 'service_type', 'cycle', 'confidence', 'evidence']
                        }
                      }
                    },
                    required: ['services']
                  }
                }
              }
            ],
            tool_choice: { type: 'function', function: { name: 'extract_csv_services' } }
          }),
        });

        clearTimeout(timeoutId);

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error('OpenAI API error:', aiResponse.status, errorText);
          throw new Error(`AI extraction failed: ${aiResponse.status} - ${errorText}`);
        }

        const aiData = await aiResponse.json();
        console.log('AI response received');
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall) {
          console.error('No tool call in AI response:', JSON.stringify(aiData));
          throw new Error('AI did not return structured data');
        }
        extractedServices = JSON.parse(toolCall.function.arguments);
        console.log(`AI extracted ${extractedServices.services.length} services from CSV`);
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.error('AI extraction failed for CSV, falling back to local parser:', msg);
        extractedServices = localParseCsv(csvText, providerName);
        console.log(`Local CSV parser extracted ${extractedServices.services.length} services`);
      }

// parsed by AI above or local parser fallback
      console.log(`AI extracted ${extractedServices.services.length} services from CSV`);
      
    } else if (document.mime_type.includes('image')) {
      // For images, use OCR (would need actual OCR library in production)
      // For now, we'll use OpenAI vision API
      const arrayBuffer = await fileData.arrayBuffer();
      
      // Convert to base64 in chunks to avoid stack overflow with large files
      const uint8Array = new Uint8Array(arrayBuffer);
      let binaryString = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64 = btoa(binaryString);
      
      const ocrResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are an OCR system. Extract ONLY the text that you actually see in the image. DO NOT invent, generate, or make up any data. DO NOT provide examples. If you cannot read something clearly, say "unreadable". Your job is to transcribe what is visible, nothing more.'
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Read this image and extract ALL visible text EXACTLY as it appears. Include:\n- Company/provider names visible at the top or in headers\n- Service names (domain names, resource names)\n- Service types (e.g., "Zonas DNS", "Domínio", "Alojamento web", "Shared CDN")\n- Dates in any format visible\n- Renewal periods (e.g., "Todos os anos", "Nenhum")\n- Any other text visible in the table or document\n\nIMPORTANT: Transcribe ONLY what you actually see. Do not make up example data.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${document.mime_type};base64,${base64}`
                  }
                }
              ]
            }
          ],
          max_tokens: 2000
        }),
      });

      if (!ocrResponse.ok) {
        const errorData = await ocrResponse.text();
        console.error('OCR API error:', errorData);
        throw new Error(`OCR failed: ${ocrResponse.status}`);
      }

      const ocrData = await ocrResponse.json();
      extractedText = ocrData.choices?.[0]?.message?.content || '';
      console.log('Extracted text from image (length):', extractedText.length);
      console.log('First 500 chars of extracted text:', extractedText.substring(0, 500));
    } else if (document.mime_type.includes('pdf')) {
      // For PDFs, extract text (would need pdf-parse or similar in production)
      extractedText = await fileData.text();
    } else {
      // For other text-based formats
      extractedText = await fileData.text();
    }

    // Only use AI extraction if not CSV (CSV already processed)
    if (!isCSV) {
      // Normalize dates and extract structured data with OpenAI
      const extractionPrompt = isTabular
        ? `Extract service renewal data from this tabular data. Parse each row and extract:\n\n${extractedText}`
        : `Extract service renewal information from this document:\n\n${extractedText}`;

      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a data extraction assistant. Extract service renewal information from the OCR text provided.

CRITICAL - DO NOT INVENT DATA:
- Extract ONLY information that is actually present in the text
- If a field is not mentioned, set it to null
- DO NOT generate example data like "example.com", "Jane Smith", "Acme Corp", "examplehost.com", "cdn-example.com"
- DO NOT make up provider names like "Cloudflare", "Hostinger" unless they ACTUALLY appear in the text
- If you don't see real data, return an empty services array

FIELD DEFINITIONS:
- Provider: The company name visible in headers, logos, or mentioned in text (e.g., OVH, Andorsoft, GoDaddy). NEVER use a domain as provider. If not visible, set to "Unknown Provider".
- Service Name: The actual domain/resource name visible in the data (e.g., "congresdeneige.com", "mountaintlikers.com"). If not clear, use the first column value.
- Service Type: Map from visible text:
  * "Zonas DNS" → domain
  * "Domínio" → domain  
  * "Alojamento web" → hosting
  * "Shared CDN" → cdn
  * If unclear, use "other"
- Client Name: Only if explicitly mentioned in the text, otherwise null
- Renewal Date: Parse dates from formats like "02/09/2026", "Antes de 20/09/2026"
- Cycle: "Todos os anos" = annual, "Nenhum" = other

Date parsing: "DD/MM/YYYY" → "YYYY-MM-DD", "Antes de DD/MM/YYYY" → use that date

VALIDATION: Before returning, verify that:
1. Service names are actual domains/resources from the text, not examples
2. Provider is from the image header/logo, not invented
3. All dates are from the actual table, not made up`
          },
          {
            role: 'user',
            content: extractionPrompt
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_renewal_data',
              description: 'Extract structured renewal data from document',
              parameters: {
                type: 'object',
                properties: {
                  services: {
                    type: 'array',
                    items: {
                      type: 'object',
                       properties: {
                         provider: { 
                           type: 'string', 
                           nullable: true,
                           description: 'The hosting/service provider company name (e.g., OVH, AWS, Google Cloud). NEVER use a domain name as provider.'
                         },
                         service_type: { 
                           type: 'string', 
                           enum: ['domain', 'hosting', 'vps', 'cdn', 'mx', 'ssl', 'other'],
                           description: 'Type of service. Map "Zonas DNS" and "Domínio" to domain, "Alojamento web" to hosting, "Shared CDN" to cdn'
                         },
                         service_name: { 
                           type: 'string', 
                           nullable: true,
                           description: 'The specific service/resource name or identifier (e.g., domain name, server name)'
                         },
                         renewal_date: { type: 'string', nullable: true, description: 'Date in YYYY-MM-DD format' },
                         cycle: { 
                           type: 'string', 
                           enum: ['annual', 'monthly', 'biennial', 'other'],
                           nullable: true,
                           description: 'Renewal frequency. "Todos os anos" means annual.'
                         },
                         client_name: { type: 'string', nullable: true },
                         confidence: { type: 'number', minimum: 0, maximum: 1 },
                         evidence: { type: 'string' }
                       },
                      required: ['service_type', 'confidence', 'evidence']
                    }
                  }
                },
                required: ['services']
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_renewal_data' } }
      }),
      });

      if (!openaiResponse.ok) {
        const errorData = await openaiResponse.text();
        console.error('OpenAI API error:', errorData);
        throw new Error(`AI extraction failed: ${openaiResponse.status}`);
      }

      const aiData = await openaiResponse.json();
      console.log('AI extraction response received');
      console.log('Full AI response (first 1000 chars):', JSON.stringify(aiData, null, 2).substring(0, 1000));
      
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) {
        console.error('No tool call in response');
        throw new Error('AI did not return structured data - possibly no real data found in image');
      }

      extractedServices = JSON.parse(toolCall?.function?.arguments || '{"services":[]}');
      
      // Validate that we're not getting example/fake data
      const examplePatterns = ['example.com', 'examplehost', 'jane smith', 'john doe', 'acme corp', 'cdn-example'];
      const hasExampleData = extractedServices.services.some((s: any) => 
        examplePatterns.some(pattern => 
          (s.service_name || '').toLowerCase().includes(pattern) ||
          (s.client_name || '').toLowerCase().includes(pattern) ||
          (s.provider || '').toLowerCase().includes(pattern)
        )
      );
      
      if (hasExampleData) {
        console.error('WARNING: Detected example/fake data in extraction results');
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'AI returned example data instead of reading the real image. Please try again or use a clearer image.',
            extractedText: extractedText.substring(0, 500)
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    const services = extractedServices.services || [];
    console.log(`Processing ${services.length} services`);

    // Get user settings for alert offset
    const { data: settings } = await supabase
      .from('renewal_settings')
      .select('default_alert_offset_days')
      .eq('user_id', user.id)
      .single();

    const alertOffsetDays = settings?.default_alert_offset_days || 
      parseInt(Deno.env.get('DEFAULT_ALERT_OFFSET_DAYS') || '45');

    const results = [];
    const errors = [];
    const today = new Date();
    const criticalThreshold = new Date(today);
    criticalThreshold.setDate(criticalThreshold.getDate() + alertOffsetDays);

    for (const service of extractedServices.services) {
      try {
      // Ensure provider exists (find or create without relying on unique index)
      let providerId: string | null = null;
      if (service.provider) {
        // Try to find provider by name
        const { data: existingProvider, error: findProviderError } = await supabase
          .from('providers')
          .select('id')
          .eq('name', service.provider)
          .maybeSingle();

        if (findProviderError) {
          console.error('Provider lookup error:', findProviderError.message);
        }

        if (existingProvider?.id) {
          providerId = existingProvider.id;
        } else {
          // Create provider if not found
          const { data: createdProvider, error: createProviderError } = await supabase
            .from('providers')
            .insert({ name: service.provider })
            .select('id')
            .single();

          if (createProviderError) {
            console.error('Provider create error:', createProviderError.message);
          } else if (createdProvider) {
            providerId = createdProvider.id;
          }
        }
      }

      // Upsert client
      let clientId: string | null = null;
      if (service.client_name) {
        // Find or create client by (name, user_id) without relying on unique index
        const { data: existingClient, error: findClientError } = await supabase
          .from('clients')
          .select('id')
          .eq('name', service.client_name)
          .eq('user_id', user.id)
          .maybeSingle();

        if (findClientError) {
          console.error('Client lookup error:', findClientError.message);
        }

        if (existingClient?.id) {
          clientId = existingClient.id;
        } else {
          const { data: createdClient, error: createClientError } = await supabase
            .from('clients')
            .insert({ name: service.client_name, user_id: user.id })
            .select('id')
            .single();
          if (createClientError) {
            console.error('Client create error:', createClientError.message);
          } else if (createdClient) {
            clientId = createdClient.id;
          }
        }
      }

      // Check if service already exists (to prevent duplicates)
      if (providerId) {
        const serviceName = service.service_name || 'Unknown Service';
        
        // Look for existing service with same name, provider, and user
        const { data: existingService, error: findServiceError } = await supabase
          .from('services')
          .select('id')
          .eq('service_name', serviceName)
          .eq('provider_id', providerId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (findServiceError) {
          console.error('Service lookup error:', findServiceError.message);
        }

        let newService: { id: string } | null = null;
        let serviceError = null;

        if (existingService?.id) {
          // Update existing service instead of creating new one
          console.log(`Updating existing service: ${serviceName} (ID: ${existingService.id})`);
          const { data: updatedService, error: updateError } = await supabase
            .from('services')
            .update({
              service_type: service.service_type,
              client_id: clientId,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingService.id)
            .select('id')
            .single();
          
          newService = updatedService;
          serviceError = updateError;
        } else {
          // Create new service
          console.log(`Creating new service: ${serviceName}`);
          const { data: createdService, error: createError } = await supabase
            .from('services')
            .insert({
              provider_id: providerId,
              service_type: service.service_type,
              service_name: serviceName,
              client_id: clientId,
              user_id: user.id
            })
            .select('id')
            .single();
          
          newService = createdService;
          serviceError = createError;
        }

        if (!serviceError && newService) {
          // Compute/normalize renewal date
          const normalizeDate = (d: string | null | undefined): string | null => {
            if (!d) return null;
            if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
            if ((d as string).includes('/')) {
              const parts = (d as string).split('/').map(p => p.trim());
              if (parts.length === 3) {
                const [day, month, year] = parts;
                return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
              }
            }
            return null;
          };

          let finalRenewalDate: string | null = normalizeDate(service.renewal_date);

          if (!finalRenewalDate && service.evidence) {
            const m = (service.evidence as string).match(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
            if (m) {
              const base = normalizeDate(m[1]);
              if (base) {
                const dateObj = new Date(base);
                const cycle = (service.cycle || 'annual') as string;
                if (cycle === 'monthly') dateObj.setMonth(dateObj.getMonth() + 1);
                else if (cycle === 'biennial') dateObj.setFullYear(dateObj.getFullYear() + 2);
                else dateObj.setFullYear(dateObj.getFullYear() + 1);
                finalRenewalDate = dateObj.toISOString().split('T')[0];
              }
            }
          }

          // As last resort, use any detected date without adding offset
          if (!finalRenewalDate && service.evidence) {
            const m2 = (service.evidence as string).match(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
            if (m2) finalRenewalDate = normalizeDate(m2[1]);
          }

          if (!finalRenewalDate) {
            const errMsg = `Missing renewal date for service: ${service.service_name}`;
            console.error(errMsg);
            errors.push({ service: service.service_name, error: errMsg });
            continue;
          }

          // Check if renewal already exists for this service
          const { data: existingRenewal, error: findRenewalError } = await supabase
            .from('renewals')
            .select('id, renewal_date')
            .eq('service_id', newService.id)
            .maybeSingle();

          if (findRenewalError) {
            console.error('Renewal lookup error:', findRenewalError.message);
          }

          let renewal: { id: string; renewal_date: string } | null = null;
          let renewalError = null;

          if (existingRenewal?.id) {
            // Update existing renewal if the date is different
            if (existingRenewal.renewal_date !== finalRenewalDate) {
              console.log(`Updating renewal date for service ${newService.id}: ${existingRenewal.renewal_date} -> ${finalRenewalDate}`);
              const { data: updatedRenewal, error: updateError } = await supabase
                .from('renewals')
                .update({
                  renewal_date: finalRenewalDate,
                  cycle: service.cycle || 'annual',
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingRenewal.id)
                .select('id, renewal_date')
                .single();
              
              renewal = updatedRenewal;
              renewalError = updateError;
            } else {
              // No change needed, just use existing
              console.log(`Renewal already exists with same date for service ${newService.id}`);
              renewal = existingRenewal;
            }
          } else {
            // Create new renewal
            console.log(`Creating new renewal for service ${newService.id}: ${finalRenewalDate}`);
            const { data: createdRenewal, error: createError } = await supabase
              .from('renewals')
              .insert({
                service_id: newService.id,
                renewal_date: finalRenewalDate,
                cycle: service.cycle || 'annual'
              })
              .select('id, renewal_date')
              .single();
            
            renewal = createdRenewal;
            renewalError = createError;
          }

          if (renewalError) {
            console.error('Renewal operation error:', renewalError.message);
          }

          if (!renewalError && renewal) {
            // Create alert
            const renewalDate = new Date(renewal.renewal_date);
            const alertDate = new Date(renewalDate);
            alertDate.setDate(alertDate.getDate() - alertOffsetDays);

            await supabase.from('alerts').insert({
              renewal_id: renewal.id,
              alert_date: alertDate.toISOString().split('T')[0],
              status: 'pending'
            });

            // Store extraction
            await supabase.from('extractions').insert({
              document_id: document.id,
              service_id: newService.id,
              extracted_data: service,
              confidence: service.confidence,
              evidence: service.evidence,
              quality_score: service.confidence
            });

            results.push({
              service_id: newService.id,
              renewal_id: renewal.id,
              provider: service.provider,
              service_name: service.service_name,
              renewal_date: renewal.renewal_date,
              is_expired: renewalDate < today,
              is_due_soon: renewalDate <= criticalThreshold && renewalDate >= today
            });
          }
        } else if (serviceError) {
          const errMsg = `Failed to create service: ${serviceError.message}`;
          console.error(errMsg, { service: service.service_name });
          errors.push({ service: service.service_name, error: errMsg });
        }
      } else {
        const errMsg = 'Missing provider ID';
        console.error(errMsg, { service: service.service_name });
        errors.push({ service: service.service_name, error: errMsg });
      }
      } catch (serviceErr: any) {
        const errMsg = serviceErr instanceof Error ? serviceErr.message : String(serviceErr);
        console.error('Error processing service:', errMsg, { service: service.service_name });
        errors.push({ service: service.service_name, error: errMsg });
      }
    }

    // Categorize results
    const expired = results.filter(r => r.is_expired);
    const dueSoon = results.filter(r => r.is_due_soon);

    console.log(`Import completed: ${results.length} successful, ${errors.length} errors`);
    if (errors.length > 0) {
      console.error('Import errors:', JSON.stringify(errors));
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: {
          total: results.length,
          expired: expired.length,
          dueSoon: dueSoon.length,
          errors: errors.length
        },
        expired,
        dueSoon,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in extract-service-data:', error);
    // Safely extract error message to avoid circular reference issues
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});