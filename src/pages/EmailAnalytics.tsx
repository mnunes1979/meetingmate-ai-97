import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, TrendingUp, MousePointer, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSelector } from "@/components/LanguageSelector";
import { MobileNav } from "@/components/MobileNav";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EmailStats {
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_bounced: number;
  total_complained: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
}

interface RecentEvent {
  id: string;
  event_type: string;
  recipient_email: string;
  created_at: string;
  email_action: {
    subject: string;
  } | null;
}

export default function EmailAnalytics() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [timeRange, setTimeRange] = useState<string>("7");
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    checkAuthAndLoad();
  }, [timeRange]);

  const checkAuthAndLoad = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        navigate("/auth");
        return;
      }

      setUser(session.user);
      
      // Check access_type
      const { data: profile } = await supabase
        .from('profiles')
        .select('access_type')
        .eq('id', session.user.id)
        .single();
      
      if (profile?.access_type === 'renewals_only') {
        toast({
          title: "Acesso Restrito",
          description: "Você só tem permissão para acessar a área de Renovações",
          variant: "destructive",
        });
        navigate("/renewals");
        return;
      }
      
      await loadAnalytics(session.user.id);
    } catch (error: any) {
      console.error("Error:", error);
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadAnalytics = async (userId: string) => {
    try {
      setLoading(true);

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(timeRange));

      // Fetch user's email_action ids to include events that might be missing user_id
      const { data: userActions } = await supabase
        .from('email_actions')
        .select('id')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      const ids = (userActions || []).map(a => a.id);
      const inFilter = ids.length > 0 ? `email_action_id.in.(${ids.join(',')})` : '';

      // Get all events for the user in the time range (by user_id or by related action)
      const { data: events, error } = await supabase
        .from('email_events')
        .select('event_type, created_at')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .or([`user_id.eq.${userId}`, inFilter].filter(Boolean).join(','));

      if (error) throw error;

      // Calculate statistics
      const eventCounts = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 } as Record<string, number>;
      events?.forEach(event => {
        const type = event.event_type as keyof typeof eventCounts;
        if (type in eventCounts) eventCounts[type]++;
      });

      const total_sent = eventCounts.sent || 0;
      const total_delivered = eventCounts.delivered;
      const total_opened = eventCounts.opened;
      const total_clicked = eventCounts.clicked;

      const calculatedStats: EmailStats = {
        total_sent,
        total_delivered,
        total_opened,
        total_clicked,
        total_bounced: eventCounts.bounced,
        total_complained: eventCounts.complained,
        delivery_rate: total_sent > 0 ? (total_delivered / (total_sent || 1)) * 100 : 0,
        open_rate: total_delivered > 0 ? (total_opened / total_delivered) * 100 : 0,
        click_rate: total_opened > 0 ? (total_clicked / total_opened) * 100 : 0,
        bounce_rate: total_sent > 0 ? (eventCounts.bounced / total_sent) * 100 : 0,
      };

      setStats(calculatedStats);

      // Get recent events with subject join; include both filters
      const { data: recent } = await supabase
        .from('email_events')
        .select(`
          id,
          event_type,
          recipient_email,
          created_at,
          email_action:email_actions(subject)
        `)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .or([`user_id.eq.${userId}`, inFilter].filter(Boolean).join(','))
        .order('created_at', { ascending: false })
        .limit(10);

      setRecentEvents(recent || []);
    } catch (error: any) {
      console.error("Error loading analytics:", error);
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'sent':
        return <Mail className="w-4 h-4 text-primary" />;
      case 'delivered':
        return <CheckCircle className="w-4 h-4 text-sentiment-positive" />;
      case 'opened':
        return <TrendingUp className="w-4 h-4 text-action-email" />;
      case 'clicked':
        return <MousePointer className="w-4 h-4 text-action-calendar" />;
      case 'bounced':
        return <XCircle className="w-4 h-4 text-sentiment-negative" />;
      case 'complained':
        return <AlertCircle className="w-4 h-4 text-sentiment-negative" />;
      default:
        return <Mail className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case 'delivered':
        return 'text-sentiment-positive';
      case 'opened':
        return 'text-action-email';
      case 'clicked':
        return 'text-action-calendar';
      case 'bounced':
      case 'complained':
        return 'text-sentiment-negative';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-10 bg-background/80">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <MobileNav userEmail={user?.email} />
              <Button variant="ghost" size="icon" asChild className="hidden md:flex">
                <NavLink to="/">
                  <ArrowLeft className="w-5 h-5" />
                </NavLink>
              </Button>
              <div>
                <h1 className="text-lg md:text-2xl font-bold">{t('analytics.title')}</h1>
                <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                  {t('analytics.subtitle')}
                </p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <ThemeToggle />
              <LanguageSelector />
            </div>
            <div className="md:hidden">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-7xl space-y-4 sm:space-y-6">
        {/* Time Range Selector */}
        <div className="flex justify-end">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('analytics.last7Days')}</SelectItem>
              <SelectItem value="30">{t('analytics.last30Days')}</SelectItem>
              <SelectItem value="90">{t('analytics.last90Days')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : stats ? (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t('analytics.totalSent')}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-primary" />
                    <p className="text-2xl font-bold">{stats.total_sent}</p>
                  </div>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t('analytics.deliveryRate')}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-sentiment-positive" />
                    <p className="text-2xl font-bold">{stats.delivery_rate.toFixed(1)}%</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stats.total_delivered} {t('analytics.delivered')}
                  </p>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t('analytics.openRate')}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-action-email" />
                    <p className="text-2xl font-bold">{stats.open_rate.toFixed(1)}%</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stats.total_opened} {t('analytics.opened')}
                  </p>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t('analytics.clickRate')}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <MousePointer className="w-5 h-5 text-action-calendar" />
                    <p className="text-2xl font-bold">{stats.click_rate.toFixed(1)}%</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stats.total_clicked} {t('analytics.clicked')}
                  </p>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t('analytics.bounceRate')}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-sentiment-negative" />
                    <p className="text-2xl font-bold">{stats.bounce_rate.toFixed(1)}%</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stats.total_bounced} {t('analytics.bounced')}
                  </p>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t('analytics.complaints')}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-sentiment-negative" />
                    <p className="text-2xl font-bold">{stats.total_complained}</p>
                  </div>
                </CardHeader>
              </Card>
            </div>

            {/* Recent Events */}
            <Card>
              <CardHeader>
                <CardTitle>{t('analytics.recentEvents')}</CardTitle>
                <CardDescription>{t('analytics.recentEventsDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {recentEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('analytics.noEvents')}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {recentEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50"
                      >
                        <div className="flex items-center gap-3">
                          {getEventIcon(event.event_type)}
                          <div>
                            <p className="text-sm font-medium">
                              {event.email_action?.subject || t('analytics.noSubject')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {event.recipient_email}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-medium capitalize ${getEventColor(event.event_type)}`}>
                            {t(`analytics.eventTypes.${event.event_type}`)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(event.created_at).toLocaleString('pt-PT', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </main>
    </div>
  );
}
