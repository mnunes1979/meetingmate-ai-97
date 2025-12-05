import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileText, Calendar, User, LogOut, Mic2, BarChart3, LayoutDashboard, Target, AlertTriangle, CheckSquare, ListTodo, AlertCircle, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NotificationBadge } from "@/components/NotificationBadge";
import { ThemeToggle } from "@/components/ThemeToggle";
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
  sentiment_score: number | null;
  opportunities: string[] | null;
  risks: string[] | null;
  action_items: Array<{ task: string; assignee: string; priority: string }> | null;
  topics: string[] | null;
  raw_llm_output: any;
}

const MyMeetings = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<MeetingNote[]>([]);
  const [dateFilter, setDateFilter] = useState<string>("7");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
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
            title: "Acesso Restrito",
            description: "Apenas tem permissão para aceder à área de Renovações",
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
        .select("id, created_at, meeting_datetime, sales_rep_name, customer_name, customer_company, language, sentiment, sentiment_score, opportunities, risks, action_items, topics, raw_llm_output")
        .eq("user_id", userId)
        .is("deleted_at", null);

      // Apply date filter
      if (dateFilter !== "all") {
        const daysAgo = parseInt(dateFilter);
        const filterDate = subDays(new Date(), daysAgo).toISOString();
        query = query.gte("created_at", filterDate);
      }

      // Apply sentiment filter
      if (sentimentFilter !== "all") {
        if (sentimentFilter === "positive") {
          query = query.gte("sentiment_score", 70);
        } else if (sentimentFilter === "neutral") {
          query = query.gte("sentiment_score", 40).lt("sentiment_score", 70);
        } else if (sentimentFilter === "negative") {
          query = query.lt("sentiment_score", 40);
        }
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;
      setNotes((data || []) as MeetingNote[]);
    } catch (error: any) {
      console.error("Error loading notes:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar as suas reuniões",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (user) {
      loadNotes(user.id);
    }
  }, [dateFilter, sentimentFilter]);

  const filteredNotes = notes.filter(note => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      note.customer_name?.toLowerCase().includes(search) ||
      note.customer_company?.toLowerCase().includes(search) ||
      note.sales_rep_name?.toLowerCase().includes(search)
    );
  });

  const getSentimentColor = (sentiment: string, score?: number | null) => {
    if (score !== null && score !== undefined) {
      if (score >= 70) return 'bg-sentiment-positive/10 text-sentiment-positive border-sentiment-positive/20';
      if (score >= 40) return 'bg-sentiment-neutral/10 text-sentiment-neutral border-sentiment-neutral/20';
      return 'bg-sentiment-negative/10 text-sentiment-negative border-sentiment-negative/20';
    }
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

  const getSentimentLabel = (sentiment: string, score?: number | null) => {
    if (score !== null && score !== undefined) {
      if (score >= 70) return `${score}/100 Positivo`;
      if (score >= 40) return `${score}/100 Neutro`;
      return `${score}/100 Negativo`;
    }
    switch (sentiment) {
      case 'positive': return 'Positivo';
      case 'neutral': return 'Neutro';
      case 'negative': return 'Negativo';
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
                <h1 className="text-lg md:text-2xl font-bold">As Minhas Reuniões</h1>
                <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">{user?.email}</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
                <Mic2 className="w-4 h-4 mr-2" />
                Gravar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/tasks")}>
                <ListTodo className="w-4 h-4 mr-2" />
                Tarefas
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/email-analytics")}>
                <BarChart3 className="w-4 h-4 mr-2" />
                Análises
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
                <LayoutDashboard className="w-4 h-4 mr-2" />
                Dashboard
              </Button>
              <NotificationBadge />
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={handleSignOut} title="Terminar Sessão">
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
        {/* Filters */}
        <div className="mb-4 sm:mb-6 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <h2 className="text-lg sm:text-xl font-semibold">
              Histórico ({filteredNotes.length})
            </h2>
            <Button onClick={() => loadNotes(user.id)} variant="outline" size="sm">
              Atualizar
            </Button>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
            </div>
            
            <div className="relative flex-1 min-w-[180px] max-w-[250px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Pesquisar cliente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="all">Todo o período</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue placeholder="Sentimento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="positive">Positivo</SelectItem>
                <SelectItem value="neutral">Neutro</SelectItem>
                <SelectItem value="negative">Negativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredNotes.length === 0 ? (
          <Card className="p-6 sm:p-8 text-center">
            <FileText className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm sm:text-base text-muted-foreground">Ainda não tem reuniões gravadas</p>
            <Button className="mt-4" onClick={() => navigate("/")}>
              <Mic2 className="w-4 h-4 mr-2" />
              Gravar Nova Reunião
            </Button>
          </Card>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {filteredNotes.map((note) => {
              const opportunities = note.opportunities as string[] | null;
              const risks = note.risks as string[] | null;
              const actionItems = note.action_items as Array<{ task: string; assignee: string; priority: string }> | null;
              const topics = note.topics as string[] | null;
              
              const emailCount = note.raw_llm_output?.email_drafts?.length || 0;
              const calendarCount = note.raw_llm_output?.calendar_events?.length || 0;
              
              return (
                <Card
                  key={note.id}
                  className="p-4 sm:p-6 hover:shadow-lg transition-shadow cursor-pointer hover:border-primary/50"
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
                            <Badge variant="outline" className={`${getSentimentColor(note.sentiment, note.sentiment_score)} text-xs`}>
                              {getSentimentLabel(note.sentiment, note.sentiment_score)}
                            </Badge>
                            {/* High Priority Badge for sentiment_score < 40 */}
                            {note.sentiment_score !== null && note.sentiment_score < 40 && (
                              <Badge variant="destructive" className="text-xs gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Alta Prioridade
                              </Badge>
                            )}
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
                              Comercial: {note.sales_rep_name}
                            </div>
                          )}

                          {/* Topics preview */}
                          {topics && topics.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {topics.slice(0, 3).map((topic, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs bg-primary/10 text-primary">
                                  {topic}
                                </Badge>
                              ))}
                              {topics.length > 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{topics.length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Metrics badges */}
                      <div className="flex gap-2 flex-wrap pt-2">
                        {opportunities && opportunities.length > 0 && (
                          <Badge variant="secondary" className="bg-sentiment-positive/10 text-sentiment-positive text-xs">
                            <Target className="w-3 h-3 mr-1" />
                            {opportunities.length} {opportunities.length === 1 ? 'Oportunidade' : 'Oportunidades'}
                          </Badge>
                        )}
                        {risks && risks.length > 0 && (
                          <Badge variant="secondary" className="bg-sentiment-negative/10 text-sentiment-negative text-xs">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {risks.length} {risks.length === 1 ? 'Risco' : 'Riscos'}
                          </Badge>
                        )}
                        {actionItems && actionItems.length > 0 && (
                          <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 text-xs">
                            <CheckSquare className="w-3 h-3 mr-1" />
                            {actionItems.length} {actionItems.length === 1 ? 'Ação' : 'Ações'}
                          </Badge>
                        )}
                        {emailCount > 0 && (
                          <Badge variant="secondary" className="bg-action-email/10 text-action-email text-xs">
                            {emailCount} {emailCount !== 1 ? 'Emails' : 'Email'}
                          </Badge>
                        )}
                        {calendarCount > 0 && (
                          <Badge variant="secondary" className="bg-action-calendar/10 text-action-calendar text-xs">
                            {calendarCount} {calendarCount !== 1 ? 'Eventos' : 'Evento'}
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <Button variant="ghost" size="sm" className="w-full sm:w-auto text-xs sm:text-sm">
                      Ver Detalhes
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
