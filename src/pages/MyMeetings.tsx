import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileText, Calendar, User, LogOut, Mic2, BarChart3, Settings as SettingsIcon } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSelector } from "@/components/LanguageSelector";
import { MobileNav } from "@/components/MobileNav";
import { useAuth } from "@/hooks/useAuth";
import { format, subDays } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MeetingNote {
  id: string;
  created_at: string;
  meeting_datetime: string | null;
  sales_rep_name: string | null;
  customer_name: string | null;
  customer_company: string | null;
  language: string;
  sentiment: string;
  raw_llm_output: any;
}

const MyMeetings = () => {
  const { t } = useTranslation();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<MeetingNote[]>([]);
  const [dateFilter, setDateFilter] = useState<string>("7");
  const [userProfile, setUserProfile] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { handleSignOut } = useAuth();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      setUser(session.user);
      
      // Load user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, access_type')
        .eq('id', session.user.id)
        .single();
      
      if (profile) {
        setUserProfile(profile);
        
        // Redirect renewals_only users to renewals page
        if (profile.access_type === 'renewals_only') {
          toast({
            title: t('myMeetings.accessRestricted', 'Acesso Restrito'),
            description: t('myMeetings.renewalsOnly', 'Apenas tem permissão para aceder à área de Renovações'),
            variant: "destructive",
          });
          navigate("/renewals");
          return;
        }
      }
      
      await loadNotes(session.user.id);
    } catch (error) {
      console.error("Error checking auth:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadNotes = async (userId: string) => {
    try {
      let query = supabase
        .from("meeting_notes")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null);

      // Apply date filter
      if (dateFilter !== "all") {
        const daysAgo = parseInt(dateFilter);
        const filterDate = subDays(new Date(), daysAgo).toISOString();
        query = query.gte("created_at", filterDate);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error: any) {
      console.error("Error loading notes:", error);
      toast({
        title: t('common.error'),
        description: t('myMeetings.loadError', 'Erro ao carregar as suas reuniões'),
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (user) {
      loadNotes(user.id);
    }
  }, [dateFilter]);

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return 'bg-sentiment-positive/10 text-sentiment-positive border-sentiment-positive/20';
      case 'neutral':
        return 'bg-sentiment-neutral/10 text-sentiment-neutral border-sentiment-neutral/20';
      case 'negative':
        return 'bg-sentiment-negative/10 text-sentiment-negative border-sentiment-negative/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getSentimentLabel = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return t('sentiment.positive', 'Positivo');
      case 'neutral': return t('sentiment.neutral', 'Neutro');
      case 'negative': return t('sentiment.negative', 'Negativo');
      default: return sentiment;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-10 bg-background/80">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <MobileNav userEmail={user?.email} accessType={userProfile?.access_type} />
              <div>
                <h1 className="text-lg md:text-2xl font-bold">{t('myMeetings.title', 'As Minhas Reuniões')}</h1>
                <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">{user?.email}</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <ThemeToggle />
              <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
                <Mic2 className="w-4 h-4 mr-2" />
                {t('navigation.recordNote', 'Gravar')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/email-analytics")}>
                <BarChart3 className="w-4 h-4 mr-2" />
                {t('navigation.analytics', 'Análises')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
                <SettingsIcon className="w-4 h-4 mr-2" />
                {t('navigation.settings', 'Definições')}
              </Button>
              <ThemeToggle />
              <LanguageSelector />
              <Button variant="ghost" size="icon" onClick={handleSignOut} title={t('navigation.signOut', 'Terminar Sessão')}>
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
            <div className="md:hidden">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-6xl">
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-semibold">
            {t('myMeetings.history', 'Histórico')} ({notes.length})
          </h2>
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t('myMeetingsFilters.last7Days', 'Últimos 7 dias')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t('myMeetingsFilters.last7Days', 'Últimos 7 dias')}</SelectItem>
                <SelectItem value="30">{t('myMeetingsFilters.last30Days', 'Últimos 30 dias')}</SelectItem>
                <SelectItem value="all">{t('myMeetingsFilters.allTime', 'Todo o tempo')}</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => loadNotes(user.id)} variant="outline" size="sm">
              {t('myMeetings.refresh', 'Atualizar')}
            </Button>
          </div>
        </div>

        {notes.length === 0 ? (
          <Card className="p-6 sm:p-8 text-center">
            <FileText className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm sm:text-base text-muted-foreground">{t('myMeetings.noMeetings', 'Ainda não tem reuniões gravadas')}</p>
          </Card>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {notes.map((note) => {
              const emailCount = note.raw_llm_output?.email_drafts?.length || 0;
              const calendarCount = note.raw_llm_output?.calendar_events?.length || 0;
              const hasActions = emailCount > 0 || calendarCount > 0;

              return (
                <Card
                  key={note.id}
                  className="p-4 sm:p-6 hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => navigate(`/meeting/${note.id}`)}
                >
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
                    <div className="flex-1 space-y-2 sm:space-y-3 w-full">
                      <div className="flex flex-col sm:flex-row items-start gap-2 sm:gap-4">
                        <div className="flex-1 w-full">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-2">
                            {note.meeting_datetime && (
                              <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground">
                                <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                                {format(new Date(note.meeting_datetime), "dd/MM/yyyy HH:mm")}
                              </div>
                            )}
                            <Badge variant="outline" className={`${getSentimentColor(note.sentiment)} text-xs`}>
                              {getSentimentLabel(note.sentiment)}
                            </Badge>
                          </div>
                          
                          {note.customer_name && (
                            <div className="flex items-start sm:items-center gap-2 mb-1 flex-wrap">
                              <User className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground mt-0.5 sm:mt-0" />
                              <span className="font-medium text-sm sm:text-base">{note.customer_name}</span>
                              {note.customer_company && (
                                <>
                                  <span className="text-muted-foreground hidden sm:inline">-</span>
                                  <span className="text-muted-foreground text-xs sm:text-sm">{note.customer_company}</span>
                                </>
                              )}
                            </div>
                          )}
                          
                          {note.sales_rep_name && (
                            <div className="text-xs sm:text-sm text-muted-foreground">
                              {t('myMeetings.salesRep', 'Comercial:')} {note.sales_rep_name}
                            </div>
                          )}
                        </div>
                      </div>

                      {hasActions && (
                        <div className="flex gap-2 flex-wrap pt-2">
                          {emailCount > 0 && (
                            <Badge variant="secondary" className="bg-action-email/10 text-action-email text-xs">
                              {emailCount} {emailCount !== 1 ? t('myMeetings.emails', 'Emails') : t('myMeetings.email', 'Email')}
                            </Badge>
                          )}
                          {calendarCount > 0 && (
                            <Badge variant="secondary" className="bg-action-calendar/10 text-action-calendar text-xs">
                              {calendarCount} {calendarCount !== 1 ? t('myMeetings.events', 'Eventos') : t('myMeetings.event', 'Evento')}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <Button variant="ghost" size="sm" className="w-full sm:w-auto text-xs sm:text-sm">
                      {t('myMeetings.viewDetails', 'Ver Detalhes')}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default MyMeetings;
