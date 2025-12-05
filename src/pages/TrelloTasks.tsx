import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useTrelloRealtime } from "@/hooks/useTrelloRealtime";
import { TrelloRealtimeIndicator } from "@/components/TrelloRealtimeIndicator";
import AdminLayout from "@/components/admin/AdminLayout";
import { 
  Trello, 
  Search, 
  Calendar, 
  User, 
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Filter,
  X
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface TrelloCard {
  id: string;
  user_id: string;
  note_id: string;
  external_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  error_message: string | null;
  labels: any;
  created_at: string;
  updated_at: string;
  profiles?: {
    name: string;
    email: string;
  };
}

interface Statistics {
  total: number;
  created: number;
  failed: number;
  draft: number;
  thisWeek: number;
  thisMonth: number;
}

export default function TrelloTasks() {
  const [tasks, setTasks] = useState<TrelloCard[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<TrelloCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [statistics, setStatistics] = useState<Statistics>({
    total: 0,
    created: 0,
    failed: 0,
    draft: 0,
    thisWeek: 0,
    thisMonth: 0,
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  // Setup realtime updates
  useTrelloRealtime({
    onInsert: (newCard) => {
      setTasks(prevTasks => {
        const newTasks = [newCard, ...prevTasks];
        calculateStatistics(newTasks);
        return newTasks;
      });
    },
    onUpdate: (updatedCard) => {
      setTasks(prevTasks => {
        const newTasks = prevTasks.map(task => 
          task.id === updatedCard.id ? updatedCard : task
        );
        calculateStatistics(newTasks);
        return newTasks;
      });
    },
    onDelete: (deletedId) => {
      setTasks(prevTasks => {
        const newTasks = prevTasks.filter(task => task.id !== deletedId);
        calculateStatistics(newTasks);
        return newTasks;
      });
    },
    showNotifications: true,
  });

  useEffect(() => {
    checkAuthAndLoadTasks();
  }, []);

  useEffect(() => {
    filterTasks();
  }, [tasks, searchQuery, statusFilter, userFilter, dateFilter]);

  const checkAuthAndLoadTasks = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate("/auth");
      return;
    }

    // Check if user is admin
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isAdmin = roles?.some(r => r.role === 'admin');
    
    if (!isAdmin) {
      toast({
        title: "Acesso Negado",
        description: "Apenas administradores podem aceder a esta página.",
        variant: "destructive",
      });
      navigate("/");
      return;
    }

    await loadTasks();
  };

  const loadTasks = async () => {
    try {
      const { data, error } = await supabase
        .from("trello_cards")
        .select(`
          *,
          profiles:user_id (
            name,
            email
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setTasks(data || []);
      calculateStatistics(data || []);
    } catch (error: any) {
      console.error("Error loading Trello tasks:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar tarefas do Trello",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateStatistics = (taskList: TrelloCard[]) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats: Statistics = {
      total: taskList.length,
      created: taskList.filter(t => t.status === 'created').length,
      failed: taskList.filter(t => t.status === 'failed').length,
      draft: taskList.filter(t => t.status === 'draft').length,
      thisWeek: taskList.filter(t => new Date(t.created_at) >= weekAgo).length,
      thisMonth: taskList.filter(t => new Date(t.created_at) >= monthAgo).length,
    };

    setStatistics(stats);
  };

  const filterTasks = () => {
    let filtered = [...tasks];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(task => 
        task.title.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        task.profiles?.name.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(task => task.status === statusFilter);
    }

    // User filter
    if (userFilter !== "all") {
      filtered = filtered.filter(task => task.user_id === userFilter);
    }

    // Date filter
    if (dateFilter !== "all") {
      const now = new Date();
      if (dateFilter === "today") {
        filtered = filtered.filter(task => {
          const taskDate = new Date(task.created_at);
          return taskDate.toDateString() === now.toDateString();
        });
      } else if (dateFilter === "week") {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(task => new Date(task.created_at) >= weekAgo);
      } else if (dateFilter === "month") {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(task => new Date(task.created_at) >= monthAgo);
      }
    }

    setFilteredTasks(filtered);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setUserFilter("all");
    setDateFilter("all");
  };

  const getStatusBadge = (status: string) => {
    const configs = {
      created: {
        label: "Criada",
        icon: CheckCircle2,
        className: "bg-sentiment-positive/10 text-sentiment-positive border-sentiment-positive/20",
      },
      draft: {
        label: "Rascunho",
        icon: Clock,
        className: "bg-muted text-muted-foreground border-border",
      },
      failed: {
        label: "Erro",
        icon: AlertCircle,
        className: "bg-sentiment-negative/10 text-sentiment-negative border-sentiment-negative/20",
      },
    };

    const config = configs[status as keyof typeof configs] || configs.draft;
    const Icon = config.icon;

    return (
      <Badge variant="outline" className={config.className}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const uniqueUsers = Array.from(new Set(tasks.map(t => t.user_id)))
    .map(userId => {
      const task = tasks.find(t => t.user_id === userId);
      return { id: userId, name: task?.profiles?.name || "Desconhecido" };
    });

  if (loading) {
    return (
      <AdminLayout title="Tarefas do Trello">
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Tarefas do Trello">
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button onClick={loadTasks} variant="outline">
              Actualizar
            </Button>
          </div>
          <TrelloRealtimeIndicator />
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Tarefas</CardTitle>
              <Trello className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.total}</div>
              <p className="text-xs text-muted-foreground">
                {statistics.thisMonth} este mês
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Criadas com Sucesso</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-sentiment-positive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-sentiment-positive">{statistics.created}</div>
              <p className="text-xs text-muted-foreground">
                {statistics.total > 0 ? Math.round((statistics.created / statistics.total) * 100) : 0}% do total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Com Erro</CardTitle>
              <AlertCircle className="h-4 w-4 text-sentiment-negative" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-sentiment-negative">{statistics.failed}</div>
              <p className="text-xs text-muted-foreground">
                Requerem atenção
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Esta Semana</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.thisWeek}</div>
              <p className="text-xs text-muted-foreground">
                Últimos 7 dias
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar tarefas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os estados</SelectItem>
                  <SelectItem value="created">Criada</SelectItem>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="failed">Com Erro</SelectItem>
                </SelectContent>
              </Select>

              {/* User Filter */}
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Utilizador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os utilizadores</SelectItem>
                  {uniqueUsers.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Date Filter */}
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Data" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as datas</SelectItem>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="week">Esta semana</SelectItem>
                  <SelectItem value="month">Este mês</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Clear Filters */}
            {(searchQuery || statusFilter !== "all" || userFilter !== "all" || dateFilter !== "all") && (
              <Button onClick={clearFilters} variant="outline" size="sm" className="gap-2">
                <X className="w-4 h-4" />
                Limpar Filtros
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Tasks List */}
        <Card>
          <CardHeader>
            <CardTitle>
              Tarefas ({filteredTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredTasks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Trello className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma tarefa encontrada</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-4 rounded-lg border border-border/50 hover:border-border transition-colors space-y-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start gap-2">
                          <h3 className="font-semibold text-lg">{task.title}</h3>
                          {getStatusBadge(task.status)}
                        </div>
                        
                        {task.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {task.description}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {task.profiles?.name || "Desconhecido"}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(task.created_at), "dd MMM yyyy 'às' HH:mm", { locale: pt })}
                          </div>
                          {task.due_date && (
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Entrega: {format(new Date(task.due_date), "dd MMM yyyy", { locale: pt })}
                            </div>
                          )}
                        </div>

                        {task.error_message && (
                          <div className="p-2 rounded bg-sentiment-negative/10 border border-sentiment-negative/20">
                            <p className="text-xs text-sentiment-negative">
                              <strong>Erro:</strong> {task.error_message}
                            </p>
                          </div>
                        )}
                      </div>

                      {task.external_id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`https://trello.com/c/${task.external_id}`, '_blank')}
                          className="gap-2"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Ver no Trello
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
