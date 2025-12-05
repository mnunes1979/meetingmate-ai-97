import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Check, X, Loader2, RefreshCw } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface UserConnection {
  id: string;
  email: string;
  name: string;
  google_linked: boolean;
  google_calendar_summary: string | null;
  google_token_expires_at: string | null;
  google_calendar_timezone: string | null;
}

export function GoogleCalendarConnections() {
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<UserConnection[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, name, google_linked, google_calendar_summary, google_token_expires_at, google_calendar_timezone')
        .order('email');

      if (error) throw error;

      setConnections(data || []);
    } catch (error: any) {
      console.error('Error loading connections:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao carregar conexões",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (userId: string, userEmail: string) => {
    if (!confirm(`Desconectar Google Calendar para ${userEmail}? O utilizador terá que reconectar manualmente.`)) {
      return;
    }

    try {
      // Use edge function to safely disconnect (admins shouldn't directly access tokens)
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-disconnect-google-calendar`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ userId }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao desconectar');
      }

      toast({
        title: "Desconectado",
        description: `Google Calendar desconectado para ${userEmail}`,
      });

      await loadConnections();
    } catch (error: any) {
      console.error('Error revoking:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao desconectar",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Conexões Google Calendar
            </CardTitle>
            <CardDescription>
              Utilizadores conectados ao Google Calendar
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadConnections} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : connections.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Nenhum utilizador conectado
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilizador</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Calendário</TableHead>
                  <TableHead>Timezone</TableHead>
                  <TableHead>Expira</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.map((conn) => (
                  <TableRow key={conn.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{conn.name || 'Sem nome'}</p>
                        <p className="text-xs text-muted-foreground">{conn.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {conn.google_linked ? (
                        <Badge variant="outline" className="bg-sentiment-positive/10 text-sentiment-positive border-sentiment-positive/20">
                          <Check className="w-3 h-3 mr-1" />
                          Conectado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">
                          <X className="w-3 h-3 mr-1" />
                          Desconectado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {conn.google_calendar_summary || '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {conn.google_calendar_timezone || '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {conn.google_token_expires_at 
                        ? new Date(conn.google_token_expires_at).toLocaleDateString('pt-PT', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {conn.google_linked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevoke(conn.id, conn.email)}
                        >
                          <X className="w-4 h-4 mr-2" />
                          Revogar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
