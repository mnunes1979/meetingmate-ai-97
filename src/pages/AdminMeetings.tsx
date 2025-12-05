import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, FileText, Calendar, User, Trash2, Archive, 
  ArchiveRestore, Target, AlertTriangle, CheckSquare, Search,
  Filter, RefreshCw
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { format, subDays } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  deleted_at: string | null;
  user_id: string;
  profiles?: { name: string | null; email: string };
}

const AdminMeetings = () => {
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState<MeetingNote[]>([]);
  const [selectedMeetings, setSelectedMeetings] = useState<Set<string>>(new Set());
  const [dateFilter, setDateFilter] = useState<string>("30");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ action: string; meetingIds: string[] } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

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

      const { data: adminCheck } = await supabase.rpc('has_role', {
        _user_id: session.user.id,
        _role: 'admin'
      });

      if (!adminCheck) {
        navigate("/");
        return;
      }

      setIsAdmin(true);
      
      // Check if super admin (email-based)
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', session.user.id)
        .single();
      
      if (profile?.email === 'mnunes.maciel@gmail.com') {
        setIsSuperAdmin(true);
      }
      
      await loadMeetings();
    } catch (error) {
      console.error("Error checking auth:", error);
      navigate("/auth");
    } finally {
      setLoading(false);
    }
  };

  const loadMeetings = async () => {
    try {
      let query = supabase
        .from("meeting_notes")
        .select(`
          id, created_at, meeting_datetime, sales_rep_name, customer_name, 
          customer_company, language, sentiment, sentiment_score, opportunities, 
          risks, action_items, topics, deleted_at, user_id,
          profiles!meeting_notes_user_id_fkey(name, email)
        `);

      // Apply status filter
      if (statusFilter === "active") {
        query = query.is("deleted_at", null);
      } else if (statusFilter === "archived") {
        query = query.not("deleted_at", "is", null);
      }

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
      setMeetings((data || []) as unknown as MeetingNote[]);
    } catch (error: any) {
      console.error("Error loading meetings:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar reuniões",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadMeetings();
    }
  }, [dateFilter, statusFilter, sentimentFilter]);

  const filteredMeetings = meetings.filter(meeting => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      meeting.customer_name?.toLowerCase().includes(search) ||
      meeting.customer_company?.toLowerCase().includes(search) ||
      meeting.sales_rep_name?.toLowerCase().includes(search) ||
      meeting.profiles?.name?.toLowerCase().includes(search) ||
      meeting.profiles?.email?.toLowerCase().includes(search)
    );
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedMeetings(new Set(filteredMeetings.map(m => m.id)));
    } else {
      setSelectedMeetings(new Set());
    }
  };

  const handleSelectMeeting = (meetingId: string, checked: boolean) => {
    const newSelected = new Set(selectedMeetings);
    if (checked) {
      newSelected.add(meetingId);
    } else {
      newSelected.delete(meetingId);
    }
    setSelectedMeetings(newSelected);
  };

  const archiveMeetings = async (meetingIds: string[]) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('meeting_notes')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', meetingIds);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: `${meetingIds.length} reunião(ões) arquivada(s)`,
      });

      setSelectedMeetings(new Set());
      await loadMeetings();
    } catch (error: any) {
      console.error("Error archiving meetings:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao arquivar reuniões",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
      setConfirmAction(null);
    }
  };

  const restoreMeetings = async (meetingIds: string[]) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('meeting_notes')
        .update({ deleted_at: null })
        .in('id', meetingIds);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: `${meetingIds.length} reunião(ões) restaurada(s)`,
      });

      setSelectedMeetings(new Set());
      await loadMeetings();
    } catch (error: any) {
      console.error("Error restoring meetings:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao restaurar reuniões",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
      setConfirmAction(null);
    }
  };

  const deleteMeetings = async (meetingIds: string[]) => {
    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Use the edge function for permanent deletion
      const { error } = await supabase.functions.invoke('admin-delete-meetings', {
        body: { meeting_ids: meetingIds },
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: `${meetingIds.length} reunião(ões) eliminada(s) permanentemente`,
      });

      setSelectedMeetings(new Set());
      await loadMeetings();
    } catch (error: any) {
      console.error("Error deleting meetings:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao eliminar reuniões",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
      setConfirmAction(null);
    }
  };

  const getSentimentColor = (sentiment: string, score?: number | null) => {
    if (score !== null && score !== undefined) {
      if (score >= 70) return 'bg-sentiment-positive/10 text-sentiment-positive border-sentiment-positive/20';
      if (score >= 40) return 'bg-sentiment-neutral/10 text-sentiment-neutral border-sentiment-neutral/20';
      return 'bg-sentiment-negative/10 text-sentiment-negative border-sentiment-negative/20';
    }
    return 'bg-muted text-muted-foreground';
  };

  const getSentimentLabel = (score?: number | null) => {
    if (score !== null && score !== undefined) {
      if (score >= 70) return `${score}/100 Positivo`;
      if (score >= 40) return `${score}/100 Neutro`;
      return `${score}/100 Negativo`;
    }
    return 'N/A';
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
    <AdminLayout title="Gestão de Reuniões">
      <div className="space-y-4">
        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filtros:</span>
            </div>
            
            <div className="relative flex-1 min-w-[200px] max-w-[300px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Pesquisar cliente, comercial..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="all">Todo o período</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativas</SelectItem>
                <SelectItem value="archived">Arquivadas</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Sentimento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="positive">Positivo</SelectItem>
                <SelectItem value="neutral">Neutro</SelectItem>
                <SelectItem value="negative">Negativo</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={() => loadMeetings()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </Card>

        {/* Bulk Actions */}
        {selectedMeetings.size > 0 && (
          <Card className="p-3 bg-primary/5 border-primary/20">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {selectedMeetings.size} reunião(ões) selecionada(s)
              </span>
              <div className="flex items-center gap-2">
                {statusFilter !== "archived" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmAction({ action: 'archive', meetingIds: Array.from(selectedMeetings) })}
                    disabled={processing}
                  >
                    <Archive className="w-4 h-4 mr-2" />
                    Arquivar
                  </Button>
                )}
                {statusFilter === "archived" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmAction({ action: 'restore', meetingIds: Array.from(selectedMeetings) })}
                    disabled={processing}
                  >
                    <ArchiveRestore className="w-4 h-4 mr-2" />
                    Restaurar
                  </Button>
                )}
                {isSuperAdmin && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmAction({ action: 'delete', meetingIds: Array.from(selectedMeetings) })}
                    disabled={processing}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Eliminar Permanentemente
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Meetings List */}
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b">
            <Checkbox
              checked={selectedMeetings.size === filteredMeetings.length && filteredMeetings.length > 0}
              onCheckedChange={handleSelectAll}
            />
            <span className="text-sm text-muted-foreground">
              Selecionar todas ({filteredMeetings.length})
            </span>
          </div>

          {filteredMeetings.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhuma reunião encontrada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMeetings.map((meeting) => {
                const opportunities = meeting.opportunities as string[] | null;
                const risks = meeting.risks as string[] | null;
                const actionItems = meeting.action_items as Array<{ task: string }> | null;
                
                return (
                  <div
                    key={meeting.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/50 ${
                      meeting.deleted_at ? 'opacity-60 bg-muted/20' : ''
                    }`}
                  >
                    <Checkbox
                      checked={selectedMeetings.has(meeting.id)}
                      onCheckedChange={(checked) => handleSelectMeeting(meeting.id, !!checked)}
                    />
                    
                    <div 
                      className="flex-1 cursor-pointer"
                      onClick={() => navigate(`/meeting/${meeting.id}`)}
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {meeting.meeting_datetime && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(meeting.meeting_datetime), "dd/MM/yyyy HH:mm")}
                          </div>
                        )}
                        <Badge variant="outline" className={`${getSentimentColor(meeting.sentiment, meeting.sentiment_score)} text-xs`}>
                          {getSentimentLabel(meeting.sentiment_score)}
                        </Badge>
                        {meeting.deleted_at && (
                          <Badge variant="secondary" className="text-xs">
                            <Archive className="w-3 h-3 mr-1" />
                            Arquivada
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 flex-wrap">
                        {meeting.customer_name && (
                          <span className="font-medium text-sm">
                            {meeting.customer_name}
                            {meeting.customer_company && (
                              <span className="text-muted-foreground"> - {meeting.customer_company}</span>
                            )}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span>{meeting.profiles?.name || meeting.profiles?.email || 'N/A'}</span>
                        {meeting.sales_rep_name && (
                          <>
                            <span>•</span>
                            <span>Comercial: {meeting.sales_rep_name}</span>
                          </>
                        )}
                      </div>

                      <div className="flex gap-2 flex-wrap mt-2">
                        {opportunities && opportunities.length > 0 && (
                          <Badge variant="secondary" className="bg-sentiment-positive/10 text-sentiment-positive text-xs">
                            <Target className="w-3 h-3 mr-1" />
                            {opportunities.length}
                          </Badge>
                        )}
                        {risks && risks.length > 0 && (
                          <Badge variant="secondary" className="bg-sentiment-negative/10 text-sentiment-negative text-xs">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {risks.length}
                          </Badge>
                        )}
                        {actionItems && actionItems.length > 0 && (
                          <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 text-xs">
                            <CheckSquare className="w-3 h-3 mr-1" />
                            {actionItems.length}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          Ações
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/meeting/${meeting.id}`)}>
                          Ver Detalhes
                        </DropdownMenuItem>
                        {!meeting.deleted_at && (
                          <DropdownMenuItem onClick={() => setConfirmAction({ action: 'archive', meetingIds: [meeting.id] })}>
                            <Archive className="w-4 h-4 mr-2" />
                            Arquivar
                          </DropdownMenuItem>
                        )}
                        {meeting.deleted_at && (
                          <DropdownMenuItem onClick={() => setConfirmAction({ action: 'restore', meetingIds: [meeting.id] })}>
                            <ArchiveRestore className="w-4 h-4 mr-2" />
                            Restaurar
                          </DropdownMenuItem>
                        )}
                        {isSuperAdmin && (
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => setConfirmAction({ action: 'delete', meetingIds: [meeting.id] })}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Eliminar Permanentemente
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === 'delete' && 'Eliminar permanentemente?'}
              {confirmAction?.action === 'archive' && 'Arquivar reuniões?'}
              {confirmAction?.action === 'restore' && 'Restaurar reuniões?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === 'delete' && (
                <span className="text-destructive">
                  Esta ação é irreversível. As reuniões serão eliminadas permanentemente do sistema.
                </span>
              )}
              {confirmAction?.action === 'archive' && 
                'As reuniões serão arquivadas e deixarão de aparecer nas listagens principais.'}
              {confirmAction?.action === 'restore' && 
                'As reuniões serão restauradas e voltarão a aparecer nas listagens principais.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmAction?.action === 'delete') {
                  deleteMeetings(confirmAction.meetingIds);
                } else if (confirmAction?.action === 'archive') {
                  archiveMeetings(confirmAction.meetingIds);
                } else if (confirmAction?.action === 'restore') {
                  restoreMeetings(confirmAction.meetingIds);
                }
              }}
              disabled={processing}
              className={confirmAction?.action === 'delete' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {processing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminMeetings;
