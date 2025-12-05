import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, Users, Calendar, Mail, BarChart3 } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";

interface DashboardMetrics {
  totalMeetings: number;
  totalEmails: number;
  totalCalendarEvents: number;
  activeSalesReps: number;
  sentimentStats: {
    positive: number;
    neutral: number;
    negative: number;
  };
  recentMeetings: Array<{
    id: string;
    created_at: string;
    sales_rep_name: string;
    customer_name: string;
    sentiment: string;
  }>;
}

const Dashboard = () => {
  const { t } = useTranslation();
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      navigate("/auth");
      return;
    }

    setUser(session.user);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      toast({
        title: t('dashboard.accessDenied', 'Acesso Negado'),
        description: t('dashboard.adminOnly', 'Apenas os administradores podem aceder ao painel.'),
        variant: "destructive",
      });
      navigate("/");
      return;
    }

    setIsAdmin(true);
    await loadMetrics();
    setLoading(false);
  };

  const loadMetrics = async () => {
    try {
      // Total de reuniões
      const { count: meetingsCount } = await supabase
        .from("meeting_notes")
        .select("*", { count: "exact", head: true });

      // Total de emails (conta eventos 'sent')
      const { count: emailsCount } = await supabase
        .from("email_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", "sent");

      // Total de eventos de calendário
      const { count: calendarCount } = await supabase
        .from("calendar_events")
        .select("*", { count: "exact", head: true });

      // Utilizadores activos
      const { count: activeReps } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("active", true);

      // Estatísticas de sentimento
      const { data: meetings } = await supabase
        .from("meeting_notes")
        .select("sentiment");

      const sentimentStats = {
        positive: meetings?.filter(m => m.sentiment === "positive").length || 0,
        neutral: meetings?.filter(m => m.sentiment === "neutral").length || 0,
        negative: meetings?.filter(m => m.sentiment === "negative").length || 0,
      };

      // Reuniões recentes
      const { data: recentMeetings } = await supabase
        .from("meeting_notes")
        .select("id, created_at, sales_rep_name, customer_name, sentiment")
        .order("created_at", { ascending: false })
        .limit(5);

      setMetrics({
        totalMeetings: meetingsCount || 0,
        totalEmails: emailsCount || 0,
        totalCalendarEvents: calendarCount || 0,
        activeSalesReps: activeReps || 0,
        sentimentStats,
        recentMeetings: recentMeetings || [],
      });
    } catch (error) {
      console.error("Error loading metrics:", error);
      toast({
        title: t('common.error'),
        description: t('dashboard.loadError', 'Erro ao carregar as métricas'),
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <AdminLayout title={t('navigation.dashboard', 'A Minha Área')}>
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Métricas principais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="p-4 sm:p-6 card-gradient border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">{t('dashboard.totalMeetings', 'Reuniões')}</p>
                <p className="text-2xl sm:text-3xl font-bold">{metrics?.totalMeetings}</p>
              </div>
              <BarChart3 className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
          </Card>

          <Card className="p-4 sm:p-6 card-gradient border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">{t('dashboard.totalEmails', 'E-mails')}</p>
                <p className="text-2xl sm:text-3xl font-bold">{metrics?.totalEmails}</p>
              </div>
              <Mail className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
          </Card>

          <Card className="p-4 sm:p-6 card-gradient border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">{t('dashboard.totalEvents', 'Eventos')}</p>
                <p className="text-2xl sm:text-3xl font-bold">{metrics?.totalCalendarEvents}</p>
              </div>
              <Calendar className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
          </Card>

          <Card className="p-4 sm:p-6 card-gradient border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">{t('dashboard.activeUsers', 'Utilizadores')}</p>
                <p className="text-2xl sm:text-3xl font-bold">{metrics?.activeSalesReps}</p>
              </div>
              <Users className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
          </Card>
        </div>

        {/* Sentimentos */}
        <Card className="p-4 sm:p-6 card-gradient border-border/50">
          <h2 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
            {t('dashboard.sentimentAnalysis', 'Análise de Sentimento')}
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className="text-center p-3 sm:p-4 rounded-lg bg-sentiment-positive/10">
              <p className="text-2xl sm:text-4xl font-bold text-sentiment-positive">{metrics?.sentimentStats.positive}</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 sm:mt-2">{t('dashboard.positive', 'Positivo')}</p>
            </div>
            <div className="text-center p-3 sm:p-4 rounded-lg bg-sentiment-neutral/10">
              <p className="text-2xl sm:text-4xl font-bold text-sentiment-neutral">{metrics?.sentimentStats.neutral}</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 sm:mt-2">{t('dashboard.neutral', 'Neutro')}</p>
            </div>
            <div className="text-center p-3 sm:p-4 rounded-lg bg-sentiment-negative/10">
              <p className="text-2xl sm:text-4xl font-bold text-sentiment-negative">{metrics?.sentimentStats.negative}</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 sm:mt-2">{t('dashboard.negative', 'Negativo')}</p>
            </div>
          </div>
        </Card>

        {/* Reuniões recentes */}
        <Card className="p-4 sm:p-6 card-gradient border-border/50">
          <h2 className="text-lg sm:text-xl font-bold mb-4">{t('dashboard.recentMeetings', 'Reuniões Recentes')}</h2>
          <div className="space-y-3">
            {metrics?.recentMeetings && metrics.recentMeetings.length > 0 ? (
              metrics.recentMeetings.map((meeting) => (
                <div 
                  key={meeting.id} 
                  className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 p-3 sm:p-4 bg-background/50 rounded-lg border border-border/50 hover:border-primary/50 transition-colors cursor-pointer" 
                  onClick={() => navigate(`/admin/meeting/${meeting.id}`)}
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm sm:text-base">{meeting.sales_rep_name}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {meeting.customer_name || t('dashboard.clientNotIdentified', 'Cliente não identificado')}
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2">
                    <span className={`inline-block px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${
                      meeting.sentiment === "positive" ? "bg-sentiment-positive/20 text-sentiment-positive" :
                      meeting.sentiment === "neutral" ? "bg-sentiment-neutral/20 text-sentiment-neutral" :
                      "bg-sentiment-negative/20 text-sentiment-negative"
                    }`}>
                      {meeting.sentiment === "positive" ? t('dashboard.positive', 'Positivo') : 
                       meeting.sentiment === "neutral" ? t('dashboard.neutral', 'Neutro') : 
                       t('dashboard.negative', 'Negativo')}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {new Date(meeting.created_at).toLocaleDateString('pt-PT', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8 text-sm">
                {t('dashboard.noMeetings', 'Ainda não há reuniões registadas')}
              </p>
            )}
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default Dashboard;
