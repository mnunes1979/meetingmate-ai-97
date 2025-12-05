import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calendar, Check, X, RefreshCw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";

interface GoogleCalendar {
  id: string;
  summary: string;
  primary: boolean;
  timeZone: string;
  backgroundColor?: string;
  accessRole: string;
}

export function GoogleCalendarSettings() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [googleLinked, setGoogleLinked] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("");
  const [selectedCalendarSummary, setSelectedCalendarSummary] = useState<string>("");
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    loadGoogleStatus();
    
    // Check for OAuth callback params
    const urlParams = new URLSearchParams(window.location.search);
    const connected = urlParams.get('connected');
    const error = urlParams.get('error');

    if (connected === 'true') {
      toast({
        title: "Conectado!",
        description: "Google Calendar conectado com sucesso",
      });
      // Clean URL
      window.history.replaceState({}, document.title, "/settings");
      setTimeout(() => loadGoogleStatus(), 1000);
    } else if (error) {
      const errorMessage = decodeURIComponent(error);
      
      // Check if it's the 403 access_denied error
      if (errorMessage.includes('access_denied') || errorMessage.includes('403')) {
        toast({
          title: "❌ Acesso Negado pelo Google",
          description: "A aplicação está em modo de teste. Precisa adicionar o seu email como 'test user' no Google Cloud Console. Veja a documentação para instruções detalhadas.",
          variant: "destructive",
          duration: 10000,
        });
      } else {
        toast({
          title: "Erro",
          description: errorMessage,
          variant: "destructive",
        });
      }
      // Clean URL
      window.history.replaceState({}, document.title, "/settings");
    }
  }, []);

  const loadGoogleStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('google_linked, google_calendar_id, google_calendar_summary, google_token_expires_at')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      setGoogleLinked(profile?.google_linked || false);
      setSelectedCalendarId(profile?.google_calendar_id || "");
      setSelectedCalendarSummary(profile?.google_calendar_summary || "");
      setTokenExpiresAt(profile?.google_token_expires_at);

      // If linked, load calendars
      if (profile?.google_linked) {
        await loadCalendars();
      }
    } catch (error) {
      console.error('Error loading Google status:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCalendars = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('list-google-calendars', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (error) throw error;
      
      setCalendars(data.calendars || []);
    } catch (error: any) {
      console.error('Error loading calendars:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao carregar calendários",
        variant: "destructive",
      });
    }
  };

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const { data: { session } } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (error) throw error;

      // Redirect to Google OAuth
      if (data?.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error: any) {
      console.error('Error connecting:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao conectar Google Calendar",
        variant: "destructive",
      });
      setConnecting(false);
    }
  };

  const handleSelectCalendar = async (calendarId: string) => {
    try {
      const calendar = calendars.find(c => c.id === calendarId);
      if (!calendar) return;

      const { data: { session } } = await supabase.auth.getSession();

      const { error } = await supabase.functions.invoke('select-google-calendar', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: {
          calendarId: calendar.id,
          calendarSummary: calendar.summary,
          calendarTimeZone: calendar.timeZone,
        },
      });

      if (error) throw error;

      setSelectedCalendarId(calendar.id);
      setSelectedCalendarSummary(calendar.summary);

      toast({
        title: "Sucesso",
        description: `Calendário "${calendar.summary}" selecionado`,
      });
    } catch (error: any) {
      console.error('Error selecting calendar:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao selecionar calendário",
        variant: "destructive",
      });
    }
  };

  const handleDisconnect = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { error } = await supabase.functions.invoke('disconnect-google-calendar', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (error) throw error;

      setGoogleLinked(false);
      setCalendars([]);
      setSelectedCalendarId("");
      setSelectedCalendarSummary("");
      setTokenExpiresAt(null);

      toast({
        title: "Desconectado",
        description: "Google Calendar desconectado com sucesso",
      });
    } catch (error: any) {
      console.error('Error disconnecting:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao desconectar",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Google Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Google Calendar
        </CardTitle>
        <CardDescription>
          Conecta a tua conta Google para sincronizar eventos de calendário
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!googleLinked ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
              <div className="flex gap-3">
                <div className="text-amber-600 dark:text-amber-500 mt-0.5">⚠️</div>
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-amber-900 dark:text-amber-100">
                    Aplicação em Modo de Teste
                  </p>
                  <p className="text-amber-800 dark:text-amber-200">
                    Para conectar, o seu email precisa estar adicionado como "test user" no Google Cloud Console. 
                    Se receber erro 403, consulte a documentação em{" "}
                    <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">
                      docs/GOOGLE_CALENDAR_OAUTH_SETUP.md
                    </code>
                  </p>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Conecta o Google Calendar para criar eventos automaticamente a partir das reuniões.
            </p>
            <Button onClick={handleConnect} disabled={connecting} className="w-full sm:w-auto">
              {connecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  A conectar...
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4 mr-2" />
                  Conectar Google Calendar
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-sentiment-positive/10 text-sentiment-positive border-sentiment-positive/20">
                  <Check className="w-3 h-3 mr-1" />
                  Conectado
                </Badge>
                {tokenExpiresAt && (
                  <span className="text-xs text-muted-foreground">
                    Expira: {new Date(tokenExpiresAt).toLocaleDateString('pt-PT', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
              <Button variant="destructive" size="sm" onClick={handleDisconnect}>
                <X className="w-4 h-4 mr-2" />
                Desconectar
              </Button>
            </div>

            {calendars.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Selecionar Calendário</label>
                <Select
                  value={selectedCalendarId}
                  onValueChange={handleSelectCalendar}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolher calendário..." />
                  </SelectTrigger>
                  <SelectContent>
                    {calendars.map((calendar) => (
                      <SelectItem key={calendar.id} value={calendar.id}>
                        <div className="flex items-center gap-2">
                          {calendar.primary && (
                            <Badge variant="secondary" className="text-xs px-1">
                              Principal
                            </Badge>
                          )}
                          <span>{calendar.summary}</span>
                          <span className="text-xs text-muted-foreground">
                            ({calendar.timeZone})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedCalendarSummary && (
                  <p className="text-sm text-muted-foreground">
                    Calendário atual: <strong>{selectedCalendarSummary}</strong>
                  </p>
                )}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={loadCalendars}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar lista
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
