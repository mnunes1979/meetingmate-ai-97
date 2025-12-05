import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const sendEmailSchema = z.object({
  recipients: z.array(z.string().email()).min(1).max(100, "Maximum 100 recipients"),
  subject: z.string().min(1).max(200, "Subject must be between 1-200 characters"),
  body: z.string().min(1).max(50000, "Body must be between 1-50000 characters"),
  fromName: z.string().max(100).optional(),
});

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer', '').trim();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limiting
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('action', 'send_email')
      .gte('created_at', oneDayAgo);

    if (count && count >= 50) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Maximum 50 emails per day.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestData = await req.json();
    const { recipients, subject, body, fromName, note_id } = {
      ...sendEmailSchema.parse(requestData),
      note_id: requestData.note_id,
    };

    console.log('Sending email for user:', user.id, 'to:', recipients.length, 'recipients');

    // Check allowed email domains
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('allowed_email_domains')
      .eq('id', user.id)
      .single();

    const allowedDomains = profile?.allowed_email_domains as string[] || [];
    
    // If domains are configured, validate recipients
    if (allowedDomains.length > 0) {
      const invalidRecipients = recipients.filter(email => {
        const domain = email.split('@')[1]?.toLowerCase();
        return !allowedDomains.some(allowed => 
          domain === allowed.toLowerCase() || domain?.endsWith(`.${allowed.toLowerCase()}`)
        );
      });

      if (invalidRecipients.length > 0) {
        return new Response(
          JSON.stringify({ 
            error: `Email domains not allowed: ${invalidRecipients.join(', ')}. Configure allowed domains in Settings.`,
            success: false 
          }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Convert markdown to simple HTML
    const htmlBody = body
      .split('\n')
      .map(line => {
        if (line.startsWith('# ')) return `<h1>${line.substring(2)}</h1>`;
        if (line.startsWith('## ')) return `<h2>${line.substring(3)}</h2>`;
        if (line.startsWith('### ')) return `<h3>${line.substring(4)}</h3>`;
        if (line.trim() === '') return '<br>';
        return `<p>${line}</p>`;
      })
      .join('\n');

    // Get and validate FROM address
    let fromAddressRaw = (Deno.env.get('RESEND_FROM') || 'AfterMeeting <no-reply@aftermeeting.andorsoft-lab.com>').trim();
    if ((fromAddressRaw.startsWith('"') && fromAddressRaw.endsWith('"')) || (fromAddressRaw.startsWith("'") && fromAddressRaw.endsWith("'"))) {
      fromAddressRaw = fromAddressRaw.slice(1, -1).trim();
    }

    // Validate format: must be 'email@example.com' or 'Name <email@example.com>'
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const namedEmailRegex = /^.+\s<[^\s@]+@[^\s@]+\.[^\s@]+>$/;

    const isValidFrom = emailRegex.test(fromAddressRaw) || namedEmailRegex.test(fromAddressRaw);
    const fromAddress = isValidFrom ? fromAddressRaw : 'AfterMeeting <no-reply@aftermeeting.andorsoft-lab.com>';

    console.log('Using FROM address:', fromAddress);

    const emailResponse = await resend.emails.send({
      from: fromAddress,
      to: recipients,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          ${htmlBody}
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #999; font-size: 12px;">
            Enviado via AfterMeeting
          </p>
        </div>
      `,
    });

    console.log("Email response:", emailResponse);

    // If email was sent successfully, immediately create a 'sent' event
    if (emailResponse.data?.id) {
      // Update email action with external_id from Resend
      await supabaseAdmin
        .from('email_actions')
        .update({ external_id: emailResponse.data.id })
        .eq('note_id', requestData.note_id || '')
        .eq('subject', subject)
        .order('created_at', { ascending: false })
        .limit(1);

      // Create 'sent' event immediately for each recipient
      for (const recipient of recipients) {
        await supabaseAdmin.from('email_events').insert({
          email_action_id: null, // Will be linked by webhook later
          user_id: user.id,
          event_type: 'sent',
          recipient_email: recipient,
          external_id: emailResponse.data.id,
          event_data: {
            subject: subject,
            from: fromAddress,
          },
        });
      }
    }

    // Log rate limit
    await supabaseAdmin.from('rate_limits').insert({
      user_id: user.id,
      action: 'send_email',
    });

    // If Resend returned an error, log details but return generic message
    if (emailResponse.error) {
      console.error('Resend API error:', emailResponse.error.message);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Unable to send email. Please try again later." 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!emailResponse.data?.id) {
      return new Response(JSON.stringify({ success: false, error: "No email ID returned from Resend" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      messageId: emailResponse.data.id 
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.errors);
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: error.errors, success: false }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    console.error("Erro ao enviar email:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
