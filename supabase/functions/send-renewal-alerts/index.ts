import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RenewalAlert {
  id: string;
  renewal_id: string;
  alert_date: string;
  renewals: {
    renewal_date: string;
    cycle: string;
    amount: number;
    currency: string;
    services: {
      service_name: string;
      service_type: string;
      user_id: string;
      providers: {
        name: string;
      };
      clients: {
        name: string;
        email: string;
      } | null;
    };
  } | null;
  alert_recipients: Array<{
    email: string;
  }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: allow CRON secret, or any authenticated user (admin gets all, user gets own)
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');

    const isCronJob = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    let actingUserId: string | null = null;
    let isAdmin = false;

    if (!isCronJob) {
      const token = authHeader?.replace('Bearer ', '');
      if (!token) {
        console.warn('Unauthorized access attempt to send-renewal-alerts (missing token)');
        return new Response(
          JSON.stringify({ error: 'Unauthorized. Login required.' }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !user) {
        console.warn('Unauthorized access attempt to send-renewal-alerts (invalid token)');
        return new Response(
          JSON.stringify({ error: 'Unauthorized. Invalid token.' }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      actingUserId = user.id;

      // Check admin role
      const { data: role } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', actingUserId)
        .eq('role', 'admin')
        .maybeSingle();
      isAdmin = !!role;

      console.log(`${isAdmin ? 'Admin' : 'User'} ${actingUserId} triggered send-renewal-alerts`);
    } else {
      console.log('Cron job triggered send-renewal-alerts');
    }

    const supabaseUrl2 = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey2 = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const resendFromRaw = Deno.env.get("RESEND_FROM") || "onboarding@resend.dev";

    const supabase = createClient(supabaseUrl2, supabaseServiceKey2);
    const resend = new Resend(resendApiKey);

    const today = new Date().toISOString().split('T')[0];

    // Helper to format the From header for Resend
    const formatFrom = (input: string): string => {
      const trimmed = input.trim();
      const simpleEmail = /^[^<>\s@]+@[^\s@]+\.[^\s@]+$/;
      if (trimmed.includes('<') && trimmed.includes('>')) return trimmed;
      if (simpleEmail.test(trimmed)) return `Renovações <${trimmed}>`;
      return 'Renovações <onboarding@resend.dev>';
    };

    const resendFrom = formatFrom(resendFromRaw);

    // If a normal user triggered this, restrict the scope to their services only
    let renewalIdFilter: string[] | null = null;
    if (actingUserId && !isAdmin && !isCronJob) {
      const { data: myServices, error: svcErr } = await supabase
        .from('services')
        .select('id')
        .eq('user_id', actingUserId);
      if (svcErr) {
        console.error('Error fetching user services:', svcErr);
        throw svcErr;
      }
      const serviceIds = (myServices || []).map((s: any) => s.id);
      if (serviceIds.length === 0) {
        return new Response(
          JSON.stringify({ message: 'No pending alerts', count: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
      const { data: myRenewals, error: renErr } = await supabase
        .from('renewals')
        .select('id')
        .in('service_id', serviceIds);
      if (renErr) {
        console.error('Error fetching user renewals:', renErr);
        throw renErr;
      }
      renewalIdFilter = (myRenewals || []).map((r: any) => r.id);
      if (renewalIdFilter.length === 0) {
        return new Response(
          JSON.stringify({ message: 'No pending alerts', count: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    }

    // Get pending alerts that are due today and not snoozed
    let query = supabase
      .from('alerts')
      .select(`
        id,
        renewal_id,
        alert_date,
        renewals (
          renewal_date,
          cycle,
          amount,
          currency,
          services (
            service_name,
            service_type,
            user_id,
            providers (name),
            clients (name, email)
          )
        ),
        alert_recipients (email)
      `)
      .eq('status', 'pending')
      .lte('alert_date', today)
      .or('snoozed_until.is.null,snoozed_until.lte.' + today);

    if (renewalIdFilter) {
      query = query.in('renewal_id', renewalIdFilter);
    }

    const { data: alerts, error: alertsError } = await query;

    if (alertsError) {
      console.error('Error fetching alerts:', alertsError);
      throw alertsError;
    }

    if (!alerts || alerts.length === 0) {
      console.log('No pending alerts to send');
      return new Response(
        JSON.stringify({ message: 'No pending alerts', count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`Processing ${alerts.length} alerts`);

    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

    let successful = 0;
    let failed = 0;
    const results: Array<{ alert: string; status: string; data?: any; error?: any }> = [];

    for (const alert of alerts as any[]) {
      try {
        if (!alert.renewals) {
          results.push({ alert: alert.id, status: 'skipped', error: 'no renewal data' });
          continue;
        }

        const renewal = alert.renewals;
        const service = renewal.services;
        const provider = service?.providers;
        const client = service?.clients;

        if (!service || !provider) {
          results.push({ alert: alert.id, status: 'skipped', error: 'incomplete data' });
          continue;
        }

        const renewalDate = new Date(renewal.renewal_date);
        const todayDt = new Date();
        const daysUntil = Math.ceil((renewalDate.getTime() - todayDt.getTime()) / (1000 * 60 * 60 * 24));
        const isExpired = daysUntil < 0;

        let statusText = '';
        if (isExpired) {
          statusText = `EXPIRADO há ${Math.abs(daysUntil)} dias`;
        } else {
          statusText = `Expira em ${daysUntil} dias`;
        }

        // Recipients
        let recipients: string[] = [];
        if (alert.alert_recipients && alert.alert_recipients.length > 0) {
          recipients = alert.alert_recipients.map((r: any) => r.email);
        } else {
          const { data: settings } = await supabase
            .from('renewal_settings')
            .select('default_recipients')
            .eq('user_id', service.user_id)
            .maybeSingle();
          if (settings && Array.isArray((settings as any).default_recipients) && (settings as any).default_recipients.length > 0) {
            recipients = (settings as any).default_recipients as string[];
          } else if (client?.email) {
            recipients = [client.email];
          }
        }

        if (recipients.length === 0) {
          console.log(`No recipients for alert ${alert.id}, skipping`);
          results.push({ alert: alert.id, status: 'skipped', error: 'no recipients' });
          continue;
        }

        const { data: tmpl } = await supabase
          .from('renewal_settings')
          .select('email_template_subject, email_template_body')
          .eq('user_id', service.user_id)
          .maybeSingle();

        const subject = tmpl?.email_template_subject || `🔔 Alerta de Renovação: ${service.service_name}`;

        const bodyTemplate = tmpl?.email_template_body || `
          <h2 style="color: ${isExpired ? '#dc2626' : daysUntil <= 7 ? '#ea580c' : '#f59e0b'};">${statusText}</h2>
          <h3>Detalhes do Serviço</h3>
          <ul>
            <li><strong>Serviço:</strong> {{service_name}}</li>
            <li><strong>Fornecedor:</strong> {{provider_name}}</li>
            <li><strong>Tipo:</strong> {{service_type}}</li>
            ${client ? `<li><strong>Cliente:</strong> {{client_name}}</li>` : ''}
          </ul>
          <h3>Informações de Renovação</h3>
          <ul>
            <li><strong>Data de Renovação:</strong> {{renewal_date}}</li>
            <li><strong>Ciclo:</strong> {{cycle}}</li>
            ${renewal.amount ? `<li><strong>Valor:</strong> {{amount}} {{currency}}</li>` : ''}
          </ul>
          <p style="margin-top: 30px; padding: 15px; background-color: ${isExpired ? '#fee2e2' : '#fef3c7'}; border-left: 4px solid ${isExpired ? '#dc2626' : '#f59e0b'};">
            ${isExpired 
              ? '⚠️ Este serviço já expirou! É necessária ação imediata para renovar o serviço.'
              : daysUntil <= 7
                ? '⚠️ Ação urgente necessária! Este serviço expira em breve.'
                : 'ℹ️ Por favor, planeie a renovação deste serviço.'}
          </p>
        `;

        const htmlBody = bodyTemplate
          .replace(/{{service_name}}/g, service.service_name)
          .replace(/{{provider_name}}/g, provider.name)
          .replace(/{{service_type}}/g, service.service_type)
          .replace(/{{client_name}}/g, client?.name || 'N/A')
          .replace(/{{renewal_date}}/g, new Date(renewal.renewal_date).toLocaleDateString('pt-PT'))
          .replace(/{{cycle}}/g, renewal.cycle)
          .replace(/{{amount}}/g, renewal.amount?.toString() || '0')
          .replace(/{{currency}}/g, renewal.currency || 'EUR');

        const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background-color: #f9fafb; padding: 20px; border-radius: 8px;">${htmlBody}</div><div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 14px;"><p>Sistema de Gestão de Renovações</p><p style="font-size: 12px;">Este é um email automático, por favor não responda.</p></div></body></html>`;

        console.log(`Sending alert ${alert.id} to ${recipients.join(', ')}`);

        let emailResponse = await resend.emails.send({
          from: resendFrom,
          to: recipients,
          subject,
          html: fullHtml,
        });

        // Retry once with safe fallback if the 'from' is invalid
        if ((emailResponse as any)?.error && ((emailResponse as any).error.statusCode === 422 || (emailResponse as any).error.name === 'validation_error')) {
          console.warn(`Invalid FROM header detected. Retrying alert ${alert.id} with fallback sender.`);
          emailResponse = await resend.emails.send({
            from: 'Renovações <onboarding@resend.dev>',
            to: recipients,
            subject,
            html: fullHtml,
          });
        }

        if ((emailResponse as any)?.error) {
          console.error(`Failed to send alert ${alert.id}:`, (emailResponse as any).error);
          failed += 1;
          results.push({ alert: alert.id, status: 'failed', error: (emailResponse as any).error });
        } else {
          await supabase
            .from('alerts')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', alert.id);
          successful += 1;
          results.push({ alert: alert.id, status: 'sent', data: (emailResponse as any).data });
        }

        // Rate limit: max 2 req/s => ~600ms delay per email
        await sleep(600);
      } catch (err) {
        console.error(`Unexpected error sending alert ${alert?.id}:`, err);
        failed += 1;
        results.push({ alert: alert?.id, status: 'error', error: (err as any)?.message || err });
        await sleep(600);
      }
    }

    console.log(`Completed: ${successful} sent, ${failed} failed out of ${alerts.length} total`);

    return new Response(
      JSON.stringify({
        message: 'Renewal alerts processed',
        total: (alerts as any[]).length,
        successful,
        failed,
        results
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in send-renewal-alerts function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
