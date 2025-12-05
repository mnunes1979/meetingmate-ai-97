import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Send, Clock, CheckCircle, AlertCircle } from 'lucide-react';

import AdminLayout from '@/components/admin/AdminLayout';

export default function RenewalSettings() {
  const queryClient = useQueryClient();
  const [alertOffsetDays, setAlertOffsetDays] = useState(45);
  const [recipients, setRecipients] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['renewal-settings'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('renewal_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setAlertOffsetDays(settings.default_alert_offset_days || 45);
      setRecipients(settings.default_recipients?.join(', ') || '');
      setEmailSubject(settings.email_template_subject || '');
      setEmailBody(settings.email_template_body || '');
    }
  }, [settings]);

  const { data: alertsStats } = useQuery({
    queryKey: ['alerts-stats'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const { count: pendingCount } = await supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lte('alert_date', today);

      const { count: sentCount } = await supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('sent_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      return {
        pending: pendingCount || 0,
        sentLastWeek: sentCount || 0,
      };
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const recipientsArray = recipients
        .split(',')
        .map(e => e.trim())
        .filter(e => e.length > 0);

      const { error } = await supabase
        .from('renewal_settings')
        .upsert({
          user_id: user.id,
          default_alert_offset_days: alertOffsetDays,
          default_recipients: recipientsArray,
          email_template_subject: emailSubject || null,
          email_template_body: emailBody || null,
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewal-settings'] });
      toast.success('Settings saved successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save settings');
    },
  });

  const handleTestAlerts = async () => {
    setIsSendingTest(true);
    try {
      // Get current user session token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Não autenticado');
      }

      const { data, error } = await supabase.functions.invoke('send-renewal-alerts', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {}
      });

      if (error) throw error;

      const result = data as { message: string; total: number; successful: number; failed: number };
      
      if (result.total === 0) {
        toast.info('Não há alertas pendentes para enviar neste momento');
      } else if (result.successful > 0) {
        toast.success(`${result.successful} alerta(s) enviado(s) com sucesso!`);
      } else {
        toast.warning(`Processados ${result.total} alertas, mas nenhum foi enviado com sucesso`);
      }
    } catch (error: any) {
      console.error('Error sending test alerts:', error);
      toast.error(error.message || 'Erro ao enviar alertas de teste');
    } finally {
      setIsSendingTest(false);
      // Refresh stats
      queryClient.invalidateQueries({ queryKey: ['alerts-stats'] });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <AdminLayout title="Renewal Settings">
      <div className="space-y-6">
        <div>
          <p className="text-muted-foreground">
            Configure default alert settings and email templates
          </p>
        </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Sistema de Alertas Automáticos
          </CardTitle>
          <CardDescription>
            Os alertas são enviados automaticamente todos os dias às 9:00 AM
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-1">
                <p className="text-sm font-medium">Alertas Pendentes</p>
                <p className="text-xs text-muted-foreground">Prontos para enviar</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-lg px-3 py-1">
                  {alertsStats?.pending || 0}
                </Badge>
                <AlertCircle className="h-5 w-5 text-orange-500" />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-1">
                <p className="text-sm font-medium">Enviados (7 dias)</p>
                <p className="text-xs text-muted-foreground">Última semana</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-lg px-3 py-1">
                  {alertsStats?.sentLastWeek || 0}
                </Badge>
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <Button
              onClick={handleTestAlerts}
              disabled={isSendingTest}
              variant="outline"
              className="w-full"
            >
              {isSendingTest ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  A enviar alertas...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar Alertas Agora (Teste Manual)
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Clique para testar o envio imediato de alertas pendentes
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alert Configuration</CardTitle>
          <CardDescription>
            Set how many days before expiry you want to receive alerts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="offset-days">Default Alert Offset (days)</Label>
            <Input
              id="offset-days"
              type="number"
              min="1"
              max="365"
              value={alertOffsetDays}
              onChange={(e) => setAlertOffsetDays(parseInt(e.target.value))}
            />
            <p className="text-sm text-muted-foreground">
              Alerts will be sent {alertOffsetDays} days before the renewal date
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipients">Default Recipients</Label>
            <Input
              id="recipients"
              placeholder="ops@example.com, finance@example.com"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Comma-separated email addresses. These will receive all renewal alerts by default.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email Template</CardTitle>
          <CardDescription>
            Customize the email template for renewal alerts (optional)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Email Subject</Label>
            <Input
              id="subject"
              placeholder="Renewal notice — {service_name} — {renewal_date}"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Available placeholders: {'{service_name}'}, {'{renewal_date}'}, {'{days_left}'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Email Body (HTML)</Label>
            <Textarea
              id="body"
              rows={10}
              placeholder={`<h2>Service Renewal Alert</h2>
<p><strong>Provider:</strong> {provider}</p>
<p><strong>Service:</strong> {service_name}</p>
<p><strong>Renewal Date:</strong> {renewal_date}</p>
<p><strong>Days Left:</strong> {days_left} days</p>`}
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Available placeholders: {'{provider}'}, {'{service_type}'}, {'{service_name}'},
              {'{client}'}, {'{renewal_date}'}, {'{days_left}'}, {'{cycle}'}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Settings
        </Button>
      </div>
      </div>
    </AdminLayout>
  );
}