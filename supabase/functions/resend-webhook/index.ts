import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { Webhook } from "https://esm.sh/svix@1.15.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

// Resend webhook event schema
const resendEventSchema = z.object({
  type: z.enum(['email.sent', 'email.delivered', 'email.opened', 'email.clicked', 'email.bounced', 'email.complained', 'email.delivery_delayed']),
  created_at: z.string(),
  data: z.object({
    email_id: z.string(),
    to: z.union([z.string(), z.array(z.string())]),
    from: z.string(),
    subject: z.string().optional(),
    click: z.object({
      link: z.string(),
      ipAddress: z.string().optional(),
      timestamp: z.string(),
    }).optional(),
  }),
});

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Received webhook request
    
    // Validate webhook signature
    const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.error('RESEND_WEBHOOK_SECRET not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook not configured' }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Get Svix headers for signature verification
    const svixId = req.headers.get('svix-id');
    const svixTimestamp = req.headers.get('svix-timestamp');
    const svixSignature = req.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.warn('Missing Svix signature headers');
      return new Response(
        JSON.stringify({ error: 'Missing signature headers' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Get raw body for signature validation
    const body = await req.text();

    // Verify webhook signature
    const wh = new Webhook(webhookSecret);
    let payload;
    try {
      payload = wh.verify(body, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as any;
      // Webhook signature verified
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Webhook payload validated

    const event = resendEventSchema.parse(payload);
    
    // Map Resend event type to our event type
    const eventTypeMap: Record<string, string> = {
      'email.sent': 'sent',
      'email.delivered': 'delivered',
      'email.opened': 'opened',
      'email.clicked': 'clicked',
      'email.bounced': 'bounced',
      'email.complained': 'complained',
      'email.delivery_delayed': 'failed',
    };

    const eventType = eventTypeMap[event.type] || 'sent';
    const recipientEmail = Array.isArray(event.data.to) ? event.data.to[0] : event.data.to;

    // Find the email action by external_id (Resend email_id)
    const { data: emailAction } = await supabaseAdmin
      .from('email_actions')
      .select('id, user_id')
      .eq('external_id', event.data.email_id)
      .maybeSingle();

    // If we don't find by external_id, try to find by recipient and recent timestamp
    let userId = emailAction?.user_id;
    let emailActionId = emailAction?.id;

    if (!emailAction) {
      // Email action not found by external_id, searching by recipient
      
      // Find recent email_actions with this recipient
      const fiveMinutesAgo = new Date(new Date(event.created_at).getTime() - 5 * 60 * 1000).toISOString();
      const { data: recentAction } = await supabaseAdmin
        .from('email_actions')
        .select('id, user_id, recipients')
        .gte('created_at', fiveMinutesAgo)
        .order('created_at', { ascending: false })
        .limit(10);

      // Find action that has this recipient
      const matchingAction = recentAction?.find(action => {
        const recipients = action.recipients as string[];
        return recipients?.includes(recipientEmail);
      });

      if (matchingAction) {
        userId = matchingAction.user_id;
        emailActionId = matchingAction.id;
      }
    }

    // User lookup completed

    // Insert event with user_id if found
    const eventData: any = {
      email_action_id: emailActionId,
      user_id: userId,
      event_type: eventType,
      recipient_email: recipientEmail,
      external_id: event.data.email_id,
      event_data: {
        ...event.data,
        raw_type: event.type,
      },
    };

    const { error: insertError } = await supabaseAdmin
      .from('email_events')
      .insert(eventData);

    if (insertError) {
      console.error('Error inserting event:', insertError);
      throw insertError;
    }

    // Event logged successfully

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        status: 200, // Return 200 to prevent Resend from retrying
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);
