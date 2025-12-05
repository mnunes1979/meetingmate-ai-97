import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, BarChart3, Target, TrendingUp, CheckSquare, Users, Calendar, Mail } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { SentimentGauge } from "@/components/dashboard/SentimentGauge";
import { RiskAlertWidget } from "@/components/dashboard/RiskAlertWidget";
import { SentimentTrendChart } from "@/components/dashboard/SentimentTrendChart";
import { TopicsBarChart } from "@/components/dashboard/TopicsBarChart";
import { ActionItemsWidget } from "@/components/dashboard/ActionItemsWidget";
import { Card } from "@/components/ui/card";
import { format, subDays, startOfDay, parseISO } from "date-fns";

interface MeetingData {
  id: string;
  created_at: string;
  customer_name: string | null;
  sentiment: string;
  sentiment_score: number | null;
  opportunities: string[] | null;
  risks: string[] | null;
  action_items: Array<{ task: string; assignee: string; priority: 'High' | 'Medium' | 'Low' }> | null;
  topics: string[] | null;
}

interface DashboardMetrics {
  totalMeetings: number;
  totalOpportunities: number;
  avgSentiment: number;
  pendingActions: number;
  totalEmails: number;
  activeUsers: number;
  risks: Array<{
    meetingId: string;
    meetingDate: string;
    customerName: string;
    risk: string;
    sentimentScore: number;
  }>;
  actionItems: Array<{
    meetingId: string;
    meetingDate: string;
    task: string;
    assignee: string;
    priority: 'High' | 'Medium' | 'Low';
  }>;
  sentimentTrend: Array<{
    date: string;
    score: number;
    count: number;
  }>;
  topicsData: Array<{
    topic: string;
    count: number;
  }>;
}

const Dashboard = () => {
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
        title: "Acesso Negado",
        description: "Apenas os administradores podem aceder ao painel.",
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
      // Fetch meetings with new structured data
      const { data: meetings, error: meetingsError } = await supabase
        .from("meeting_notes")
        .select("id, created_at, customer_name, sentiment, sentiment_score, opportunities, risks, action_items, topics")
        .is("deleted_at", null)
        .gte("created_at", subDays(new Date(), 30).toISOString())
        .order("created_at", { ascending: false });

      if (meetingsError) throw meetingsError;

      const meetingData = (meetings || []) as MeetingData[];

      // Calculate metrics
      const totalMeetings = meetingData.length;
      
      // Count all opportunities
      const totalOpportunities = meetingData.reduce((acc, m) => {
        const opps = m.opportunities as string[] | null;
        return acc + (opps?.length || 0);
      }, 0);

      // Calculate average sentiment score
      const scoresWithValues = meetingData.filter(m => m.sentiment_score !== null);
      const avgSentiment = scoresWithValues.length > 0
        ? Math.round(scoresWithValues.reduce((acc, m) => acc + (m.sentiment_score || 0), 0) / scoresWithValues.length)
        : 50;

      // Collect all action items
      const allActionItems: DashboardMetrics['actionItems'] = [];
      meetingData.forEach(m => {
        const items = m.action_items as Array<{ task: string; assignee: string; priority: 'High' | 'Medium' | 'Low' }> | null;
        if (items && Array.isArray(items)) {
          items.forEach(item => {
            allActionItems.push({
              meetingId: m.id,
              meetingDate: m.created_at,
              task: item.task,
              assignee: item.assignee || 'A definir',
              priority: item.priority || 'Medium',
            });
          });
        }
      });

      // Collect risks from meetings with low sentiment or explicit risks
      const allRisks: DashboardMetrics['risks'] = [];
      meetingData.forEach(m => {
        const risks = m.risks as string[] | null;
        if (risks && Array.isArray(risks)) {
          risks.forEach(risk => {
            allRisks.push({
              meetingId: m.id,
              meetingDate: m.created_at,
              customerName: m.customer_name || 'Cliente não identificado',
              risk: risk,
              sentimentScore: m.sentiment_score || 50,
            });
          });
        }
        // Also flag meetings with very low sentiment
        if ((m.sentiment_score || 50) < 40 && !risks?.length) {
          allRisks.push({
            meetingId: m.id,
            meetingDate: m.created_at,
            customerName: m.customer_name || 'Cliente não identificado',
            risk: 'Cliente com sentimento negativo detetado',
            sentimentScore: m.sentiment_score || 30,
          });
        }
      });

      // Calculate sentiment trend (group by day)
      const sentimentByDay = new Map<string, { total: number; count: number }>();
      meetingData.forEach(m => {
        if (m.sentiment_score !== null) {
          const dateKey = format(new Date(m.created_at), 'yyyy-MM-dd');
          const existing = sentimentByDay.get(dateKey) || { total: 0, count: 0 };
          sentimentByDay.set(dateKey, {
            total: existing.total + (m.sentiment_score || 0),
            count: existing.count + 1,
          });
        }
      });

      const sentimentTrend = Array.from(sentimentByDay.entries())
        .map(([date, data]) => ({
          date,
          score: Math.round(data.total / data.count),
          count: data.count,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Aggregate topics
      const topicsCount = new Map<string, number>();
      meetingData.forEach(m => {
        const topics = m.topics as string[] | null;
        if (topics && Array.isArray(topics)) {
          topics.forEach(topic => {
            const normalized = topic.trim().toLowerCase();
            if (normalized) {
              topicsCount.set(normalized, (topicsCount.get(normalized) || 0) + 1);
            }
          });
        }
      });

      const topicsData = Array.from(topicsCount.entries())
        .map(([topic, count]) => ({
          topic: topic.charAt(0).toUpperCase() + topic.slice(1),
          count,
        }))
        .sort((a, b) => b.count - a.count);

      // Fetch email count
      const { count: emailsCount } = await supabase
        .from("email_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", "sent");

      // Fetch active users
      const { count: activeUsers } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("active", true);

      setMetrics({
        totalMeetings,
        totalOpportunities,
        avgSentiment,
        pendingActions: allActionItems.length,
        totalEmails: emailsCount || 0,
        activeUsers: activeUsers || 0,
        risks: allRisks.sort((a, b) => a.sentimentScore - b.sentimentScore),
        actionItems: allActionItems,
        sentimentTrend,
        topicsData,
      });
    } catch (error) {
      console.error("Error loading metrics:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar as métricas do dashboard",
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

  const getSentimentColor = (score: number) => {
    if (score >= 70) return "text-sentiment-positive";
    if (score >= 40) return "text-sentiment-neutral";
    return "text-sentiment-negative";
  };

  return (
    <AdminLayout title="Dashboard de Business Intelligence">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Overview Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <MetricCard
            title="Total de Reuniões"
            value={metrics?.totalMeetings || 0}
            icon={BarChart3}
          />
          <MetricCard
            title="Oportunidades Detetadas"
            value={metrics?.totalOpportunities || 0}
            icon={Target}
            colorClass="text-sentiment-positive"
          />
          <Card className="p-4 sm:p-6 card-gradient border-border/50">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground">Sentimento Médio</p>
                <SentimentGauge score={metrics?.avgSentiment || 50} />
              </div>
            </div>
          </Card>
          <MetricCard
            title="Ações Pendentes"
            value={metrics?.pendingActions || 0}
            icon={CheckSquare}
            colorClass={metrics?.pendingActions && metrics.pendingActions > 5 ? "text-amber-500" : undefined}
          />
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <MetricCard
            title="E-mails Enviados"
            value={metrics?.totalEmails || 0}
            icon={Mail}
          />
          <MetricCard
            title="Utilizadores Ativos"
            value={metrics?.activeUsers || 0}
            icon={Users}
          />
          <MetricCard
            title="Alertas de Risco"
            value={metrics?.risks?.length || 0}
            icon={TrendingUp}
            colorClass={metrics?.risks && metrics.risks.length > 0 ? "text-sentiment-negative" : "text-sentiment-positive"}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <SentimentTrendChart 
            data={metrics?.sentimentTrend || []} 
            title="Tendência de Sentimento (30 dias)"
          />
          <TopicsBarChart 
            data={metrics?.topicsData || []} 
            title="Tópicos Mais Discutidos"
          />
        </div>

        {/* Action Items and Risks Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <ActionItemsWidget 
            items={metrics?.actionItems || []} 
            title="Ações Pendentes"
          />
          <RiskAlertWidget 
            risks={metrics?.risks || []} 
            title="Alertas de Risco"
          />
        </div>
      </div>
    </AdminLayout>
  );
};

export default Dashboard;
