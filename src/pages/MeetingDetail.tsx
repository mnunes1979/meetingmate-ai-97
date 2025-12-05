import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, User, TrendingUp, TrendingDown, AlertTriangle, Lightbulb, Mail, CheckCircle2, XCircle, Sparkles, ListTodo } from "lucide-react";
import { EntitiesCard } from "@/components/meeting/EntitiesCard";
import { FollowUpEmailDialog } from "@/components/meeting/FollowUpEmailDialog";
import { MeetingKanban } from "@/components/meeting/MeetingKanban";
import { MeetingComments } from "@/components/meeting/MeetingComments";
import { useTranslation } from "react-i18next";
import AdminLayout from "@/components/admin/AdminLayout";

interface MeetingData {
  id: string;
  created_at: string;
  meeting_datetime: string | null;
  meeting_duration_min: number | null;
  sales_rep_name: string | null;
  customer_name: string | null;
  customer_company: string | null;
  language: string;
  sentiment: string;
  sentiment_confidence: number | null;
  participants: any;
  raw_llm_output: any;
  transcript_text: string;
  action_items: any[] | null;
}

const MeetingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [emailActions, setEmailActions] = useState<any[]>([]);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [importingTasks, setImportingTasks] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();

  const importActionItemsAsTasks = async () => {
    if (!meeting || !user) return;
    
    const actionItems = meeting.action_items || meeting.raw_llm_output?.action_items || [];
    if (actionItems.length === 0) {
      toast({
        title: "Sem ações",
        description: "Esta reunião não tem ações para importar",
        variant: "destructive",
      });
      return;
    }

    setImportingTasks(true);
    try {
      const tasks = actionItems.map((item: any) => ({
        user_id: user.id,
        meeting_id: meeting.id,
        title: typeof item === 'string' ? item : item.task || item.title || 'Tarefa',
        description: meeting.customer_name ? `Cliente: ${meeting.customer_name}` : null,
        assignee: typeof item === 'string' ? null : item.assignee || null,
        priority: typeof item === 'string' ? 'Medium' : (item.priority || 'Medium'),
        status: 'todo',
      }));

      const { error } = await supabase.from('tasks').insert(tasks);
      if (error) throw error;

      toast({
        title: "Tarefas importadas",
        description: `${tasks.length} tarefa(s) adicionada(s) ao Plano de Ação`,
      });

      navigate('/tasks');
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Erro ao importar tarefas",
        variant: "destructive",
      });
    } finally {
      setImportingTasks(false);
    }
  };

  useEffect(() => {
    checkAuthAndLoad();
  }, [id]);

  const checkAuthAndLoad = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        navigate("/auth");
        return;
      }

      setUser(session.user);

      // Check admin role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin')
        .maybeSingle();

      const adminStatus = !!roleData;
      setIsAdmin(adminStatus);

      await loadMeeting(session.user.id, adminStatus);
    } catch (error: any) {
      console.error("Error:", error);
      navigate("/auth");
    }
  };

  const loadMeeting = async (userId: string, isAdmin: boolean) => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('meeting_notes')
        .select('*')
        .eq('id', id);

      // Se não é admin, só pode ver suas próprias reuniões
      if (!isAdmin) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query.single();

      if (error) throw error;
      if (!data) throw new Error(t('meetingDetail.notFound'));

      setMeeting(data as MeetingData);

      // Carregar ações executadas
      const { data: emails } = await supabase
        .from('email_actions')
        .select('*')
        .eq('note_id', id);
      
      setEmailActions(emails || []);

    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message || t('meetingDetail.loadError'),
        variant: "destructive",
      });
      navigate("/my-meetings");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMeetingDetails = async (updates: {
    customerName?: string;
    customerCompany?: string;
    participants?: Array<{ name: string; role?: string }>;
  }) => {
    if (!meeting || !isAdmin) return;
    
    try {
      const { error } = await supabase
        .from('meeting_notes')
        .update({
          customer_name: updates.customerName || null,
          customer_company: updates.customerCompany || null,
          participants: updates.participants || [],
          updated_at: new Date().toISOString(),
        })
        .eq('id', meeting.id);

      if (error) throw error;

      setMeeting({
        ...meeting,
        customer_name: updates.customerName || null,
        customer_company: updates.customerCompany || null,
        participants: updates.participants || [],
      });

      toast({
        title: "Sucesso",
        description: "Detalhes da reunião atualizados",
      });
    } catch (error: any) {
      console.error('Error updating meeting:', error);
      toast({
        title: "Erro",
        description: "Erro ao atualizar os detalhes",
        variant: "destructive",
      });
      throw error;
    }
  };

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

  if (loading) {
    return (
      <AdminLayout title={t('meetingDetail.title')}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (!meeting) return null;

  const analysis = meeting.raw_llm_output || {};
  const summary = analysis.summary || {};
  const participants = analysis.participants || meeting.participants || [];
  const salesOpportunities = analysis.sales_opportunities || [];
  const clientNeeds = analysis.client_needs || [];
  const objections = analysis.objections || [];
  const businessInsights = analysis.business_insights || {};
  const risks = analysis.risks || [];
  const actionItems = meeting.action_items || analysis.action_items || [];

  return (
    <AdminLayout title={t('meetingDetail.title')}>
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
        {/* Info Básica - Editável para admins */}
        <EntitiesCard
          customerName={meeting.customer_name || undefined}
          customerCompany={meeting.customer_company || undefined}
          participants={participants}
          meetingDatetime={meeting.meeting_datetime || undefined}
          meetingDuration={meeting.meeting_duration_min || undefined}
          onUpdate={isAdmin ? handleUpdateMeetingDetails : undefined}
        />

        {/* Badges de info */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-2">
            {meeting.sales_rep_name && (
              <Badge variant="outline" className="gap-1.5">
                <User className="w-3 h-3" />
                {meeting.sales_rep_name}
              </Badge>
            )}
            <Badge variant="outline" className={getSentimentColor(meeting.sentiment)}>
              {t(`sentiment.${meeting.sentiment as 'positive' | 'neutral' | 'negative'}`)}
              {meeting.sentiment_confidence && (
                <span className="ml-1 text-xs opacity-70">
                  ({Math.round(meeting.sentiment_confidence * 100)}%)
                </span>
              )}
            </Badge>
            <Badge variant="outline">
              {meeting.language.toUpperCase()}
            </Badge>
          </div>
        </Card>

        {/* Resumo */}
        {summary.overview && (
          <Card className="p-6 space-y-4">
            <h2 className="text-xl font-bold">{t('meetingDetail.summary')}</h2>
            <p className="text-foreground/90">{summary.overview}</p>

            {summary.topics_discussed && summary.topics_discussed.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">{t('meetingDetail.topicsDiscussed')}</h3>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {summary.topics_discussed.map((topic: string, i: number) => (
                    <li key={i}>{topic}</li>
                  ))}
                </ul>
              </div>
            )}

            {summary.key_points && summary.key_points.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">{t('meetingDetail.keyPoints')}</h3>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {summary.key_points.map((point: string, i: number) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}

        {/* Análise SWOT */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Pontos Fortes */}
          {summary.strengths && summary.strengths.length > 0 && (
            <Card className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-sentiment-positive" />
                <h3 className="font-bold">{t('meetingDetail.strengths')}</h3>
              </div>
              <ul className="space-y-2 text-sm">
                {summary.strengths.map((strength: string, i: number) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-sentiment-positive">✓</span>
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Pontos Fracos */}
          {summary.weaknesses && summary.weaknesses.length > 0 && (
            <Card className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-sentiment-negative" />
                <h3 className="font-bold">{t('meetingDetail.weaknesses')}</h3>
              </div>
              <ul className="space-y-2 text-sm">
                {summary.weaknesses.map((weakness: string, i: number) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-sentiment-negative">✗</span>
                    <span>{weakness}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Oportunidades de Vendas */}
        {salesOpportunities.length > 0 && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold">{t('meetingDetail.salesOpportunities')}</h2>
            </div>
            <div className="space-y-4">
              {salesOpportunities.map((opp: any, i: number) => (
                <div key={i} className="p-4 rounded-lg bg-background/50 border border-border/50 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <h4 className="font-semibold">{opp.title}</h4>
                    <div className="flex gap-2">
                      <Badge variant="outline" className={
                        opp.estimated_value === 'high' ? 'border-sentiment-positive text-sentiment-positive' :
                        opp.estimated_value === 'medium' ? 'border-primary text-primary' :
                        'border-muted-foreground text-muted-foreground'
                      }>
                        {opp.estimated_value}
                      </Badge>
                      <Badge variant="outline">
                        {opp.probability}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-foreground/80">{opp.description}</p>
                  {opp.product_service && (
                    <p className="text-sm"><strong>{t('meetingDetail.productService')}</strong> {opp.product_service}</p>
                  )}
                  {opp.trigger && (
                    <p className="text-sm text-muted-foreground"><strong>{t('meetingDetail.trigger')}</strong> {opp.trigger}</p>
                  )}
                  {opp.recommended_action && (
                    <p className="text-sm text-primary"><strong>{t('meetingDetail.recommendedAction')}</strong> {opp.recommended_action}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Necessidades do Cliente */}
        {clientNeeds.length > 0 && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold">{t('meetingDetail.clientNeeds')}</h2>
            </div>
            <div className="space-y-3">
              {clientNeeds.map((need: any, i: number) => (
                <div key={i} className="p-3 rounded-lg bg-background/50 border border-border/50">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <p className="font-medium">{need.need}</p>
                    <Badge variant={
                      need.importance === 'high' ? 'default' :
                      need.importance === 'medium' ? 'secondary' :
                      'outline'
                    }>
                      {need.importance}
                    </Badge>
                  </div>
                  {need.solution && (
                    <p className="text-sm text-muted-foreground">{need.solution}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Objeções */}
        {objections.length > 0 && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-sentiment-negative" />
              <h2 className="text-xl font-bold">{t('meetingDetail.objections')}</h2>
            </div>
            <div className="space-y-3">
              {objections.map((obj: any, i: number) => (
                <div key={i} className="p-3 rounded-lg bg-background/50 border border-border/50 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <p className="font-medium">{obj.objection}</p>
                    <div className="flex gap-2">
                      <Badge variant="outline">{obj.type}</Badge>
                      <Badge variant={
                        obj.severity === 'high' ? 'destructive' :
                        obj.severity === 'medium' ? 'secondary' :
                        'outline'
                      }>
                        {obj.severity}
                      </Badge>
                    </div>
                  </div>
                  {obj.response && (
                    <p className="text-sm text-primary"><strong>{t('meetingDetail.suggestedResponse')}</strong> {obj.response}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Business Insights */}
        {businessInsights && Object.keys(businessInsights).length > 0 && (
          <Card className="p-6 space-y-4">
            <h2 className="text-xl font-bold">{t('meetingDetail.businessInsights')}</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {businessInsights.overall_interest && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('meetingDetail.interestLevel')}</p>
                  <Badge className="mt-1" variant={
                    businessInsights.overall_interest === 'high' ? 'default' :
                    businessInsights.overall_interest === 'medium' ? 'secondary' :
                    'outline'
                  }>
                    {businessInsights.overall_interest}
                  </Badge>
                </div>
              )}
              {businessInsights.decision_stage && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('meetingDetail.decisionStage')}</p>
                  <p className="mt-1">{businessInsights.decision_stage}</p>
                </div>
              )}
              {businessInsights.budget_indicators && (
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-muted-foreground">{t('meetingDetail.budgetIndicators')}</p>
                  <p className="mt-1 text-sm">{businessInsights.budget_indicators}</p>
                </div>
              )}
              {businessInsights.timeline_indicators && (
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-muted-foreground">{t('meetingDetail.timelineIndicators')}</p>
                  <p className="mt-1 text-sm">{businessInsights.timeline_indicators}</p>
                </div>
              )}
              {businessInsights.competition_mentions && (
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-muted-foreground">{t('meetingDetail.competitionMentions')}</p>
                  <p className="mt-1 text-sm">{businessInsights.competition_mentions}</p>
                </div>
              )}
              {businessInsights.key_influencers && (
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-muted-foreground">{t('meetingDetail.keyInfluencers')}</p>
                  <p className="mt-1 text-sm">{businessInsights.key_influencers}</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Riscos */}
        {risks.length > 0 && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-sentiment-negative" />
              <h2 className="text-xl font-bold">{t('meetingDetail.identifiedRisks')}</h2>
            </div>
            <div className="space-y-3">
              {risks.map((risk: any, i: number) => (
                <div key={i} className="p-3 rounded-lg bg-background/50 border border-border/50 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <p className="font-medium">{risk.label}</p>
                    <Badge variant={
                      risk.severity === 'high' ? 'destructive' :
                      risk.severity === 'medium' ? 'secondary' :
                      'outline'
                    }>
                      {risk.severity}
                    </Badge>
                  </div>
                  {risk.note && (
                    <p className="text-sm text-foreground/80">{risk.note}</p>
                  )}
                  {risk.mitigation && (
                    <p className="text-sm text-primary"><strong>{t('meetingDetail.mitigation')}</strong> {risk.mitigation}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Ações Executadas */}
        {emailActions.length > 0 && (
          <Card className="p-6 space-y-4">
            <h2 className="text-xl font-bold">{t('meetingDetail.executedActions')}</h2>
            
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Mail className="w-4 h-4 text-action-email" />
                {t('meetingDetail.emails')} ({emailActions.length})
              </h3>
              {emailActions.map((action) => {
                const isSuccess = action.status === 'sent';
                const isError = action.status === 'error';
                
                return (
                  <div 
                    key={action.id} 
                    className={`p-4 rounded-lg border-2 ${
                      isSuccess ? 'bg-sentiment-positive/5 border-sentiment-positive/30' :
                      isError ? 'bg-sentiment-negative/5 border-sentiment-negative/30' :
                      'bg-background/50 border-border/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold">{action.subject}</p>
                          {isSuccess && <CheckCircle2 className="w-4 h-4 text-sentiment-positive" />}
                          {isError && <XCircle className="w-4 h-4 text-sentiment-negative" />}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {action.audience}
                        </Badge>
                      </div>
                      <Badge variant={
                        isSuccess ? 'default' : 
                        isError ? 'destructive' : 
                        'secondary'
                      } className={
                        isSuccess ? 'bg-sentiment-positive text-white' : ''
                      }>
                        {action.status === 'sent' ? t('meetingDetail.sent') : 
                         action.status === 'error' ? t('meetingDetail.error') : 
                         action.status}
                      </Badge>
                    </div>
                    {action.recipients && action.recipients.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {t('meetingDetail.to')} {action.recipients.join(', ')}
                      </p>
                    )}
                    {isSuccess && action.sent_at && (
                      <p className="text-xs text-sentiment-positive mt-1">
                        {t('meetingDetail.sentAt')} {new Date(action.sent_at).toLocaleString(i18n.language === 'pt' ? 'pt-PT' : 'en-US')}
                      </p>
                    )}
                    {isError && action.error_message && (
                      <p className="text-xs text-sentiment-negative mt-1">
                        {t('meetingDetail.error')}: {action.error_message}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Ações Extraídas pela IA */}
        {actionItems.length > 0 && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <ListTodo className="w-5 h-5 text-primary" />
                Ações Identificadas ({actionItems.length})
              </h2>
              <Button onClick={importActionItemsAsTasks} disabled={importingTasks} size="sm">
                {importingTasks ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ListTodo className="w-4 h-4 mr-2" />
                )}
                Importar para Tarefas
              </Button>
            </div>
            <ul className="space-y-2">
              {actionItems.map((item: any, i: number) => (
                <li key={i} className="flex gap-3 items-start p-2 rounded bg-muted/30">
                  <span className="text-primary mt-1">→</span>
                  <div className="flex-1">
                    <span className="text-sm font-medium">{typeof item === 'string' ? item : item.task || item.title}</span>
                    {item.assignee && <span className="text-xs text-muted-foreground ml-2">({item.assignee})</span>}
                    {item.priority && <Badge variant="outline" className="ml-2 text-xs">{item.priority}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Botão de Gerar Email de Follow-up */}
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Gerar Email de Follow-up</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Use IA para criar um email profissional baseado nesta reunião
              </p>
            </div>
            <Button onClick={() => setEmailDialogOpen(true)} className="w-full sm:w-auto">
              <Sparkles className="w-4 h-4 mr-2" />
              Gerar Email de Follow-up
            </Button>
          </div>
        </Card>

        {/* Kanban - Plano de Ação */}
        <MeetingKanban 
          meetingId={meeting.id} 
          actionItems={actionItems} 
          userId={user?.id} 
        />

        {/* Comments */}
        <MeetingComments 
          meetingId={meeting.id} 
          userId={user?.id} 
        />

        <FollowUpEmailDialog
          meetingId={meeting.id}
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
        />
      </div>
    </AdminLayout>
  );
};

export default MeetingDetail;
