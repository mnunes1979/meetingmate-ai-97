import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, GripVertical, CheckCircle2, Clock, AlertCircle, Trash2, ExternalLink, LogOut, BarChart3, Settings as SettingsIcon, Mic2 } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSelector } from "@/components/LanguageSelector";
import { MobileNav } from "@/components/MobileNav";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface Task {
  id: string;
  user_id: string;
  meeting_id: string | null;
  title: string;
  description: string | null;
  assignee: string | null;
  priority: 'High' | 'Medium' | 'Low';
  status: 'todo' | 'in_progress' | 'done';
  due_date: string | null;
  created_at: string;
}

const COLUMNS = [
  { id: 'todo', title: 'A Fazer', icon: Clock, color: 'text-muted-foreground' },
  { id: 'in_progress', title: 'Em Progresso', icon: AlertCircle, color: 'text-amber-500' },
  { id: 'done', title: 'Concluído', icon: CheckCircle2, color: 'text-sentiment-positive' },
] as const;

const Tasks = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTask, setNewTask] = useState<{ title: string; description: string; assignee: string; priority: 'High' | 'Medium' | 'Low' }>({ title: '', description: '', assignee: '', priority: 'Medium' });
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
      await loadTasks(session.user.id);
    } catch (error) {
      console.error("Error checking auth:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTasks = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTasks((data || []) as Task[]);
    } catch (error: any) {
      console.error("Error loading tasks:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar tarefas",
        variant: "destructive",
      });
    }
  };

  const handleDragStart = (task: Task) => {
    setDraggedTask(task);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (status: 'todo' | 'in_progress' | 'done') => {
    if (!draggedTask || draggedTask.status === status) {
      setDraggedTask(null);
      return;
    }

    try {
      const { error } = await supabase
        .from("tasks")
        .update({ status })
        .eq("id", draggedTask.id);

      if (error) throw error;

      setTasks(prev =>
        prev.map(t => t.id === draggedTask.id ? { ...t, status } : t)
      );

      toast({
        title: "Tarefa atualizada",
        description: `Movida para "${COLUMNS.find(c => c.id === status)?.title}"`,
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Erro ao atualizar tarefa",
        variant: "destructive",
      });
    } finally {
      setDraggedTask(null);
    }
  };

  const handleCreateTask = async () => {
    if (!newTask.title.trim() || !user) return;

    try {
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          user_id: user.id,
          title: newTask.title,
          description: newTask.description || null,
          assignee: newTask.assignee || null,
          priority: newTask.priority,
          status: 'todo',
        })
        .select()
        .single();

      if (error) throw error;

      setTasks(prev => [data as Task, ...prev]);
      setNewTask({ title: '', description: '', assignee: '', priority: 'Medium' });
      setIsCreateOpen(false);

      toast({
        title: "Tarefa criada",
        description: "Nova tarefa adicionada com sucesso",
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Erro ao criar tarefa",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", taskId);

      if (error) throw error;

      setTasks(prev => prev.filter(t => t.id !== taskId));

      toast({
        title: "Tarefa eliminada",
        description: "Tarefa removida com sucesso",
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Erro ao eliminar tarefa",
        variant: "destructive",
      });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High':
        return "bg-sentiment-negative/10 text-sentiment-negative border-sentiment-negative/20";
      case 'Medium':
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case 'Low':
        return "bg-sentiment-positive/10 text-sentiment-positive border-sentiment-positive/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'High': return 'Alta';
      case 'Medium': return 'Média';
      case 'Low': return 'Baixa';
      default: return priority;
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
              <MobileNav userEmail={user?.email} />
              <div>
                <h1 className="text-lg md:text-2xl font-bold">Plano de Ação</h1>
                <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                  Gerencie as suas tarefas
                </p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
                <Mic2 className="w-4 h-4 mr-2" />
                Gravar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
                <BarChart3 className="w-4 h-4 mr-2" />
                Dashboard
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
                <SettingsIcon className="w-4 h-4 mr-2" />
                Definições
              </Button>
              <ThemeToggle />
              <LanguageSelector />
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

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="mb-4 sm:mb-6 flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-semibold">
            Tarefas ({tasks.length})
          </h2>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Nova Tarefa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Tarefa</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Título</Label>
                  <Input
                    id="title"
                    value={newTask.title}
                    onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Descrição da tarefa..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição (opcional)</Label>
                  <Textarea
                    id="description"
                    value={newTask.description}
                    onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Detalhes adicionais..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="assignee">Responsável (opcional)</Label>
                  <Input
                    id="assignee"
                    value={newTask.assignee}
                    onChange={(e) => setNewTask(prev => ({ ...prev, assignee: e.target.value }))}
                    placeholder="Nome do responsável..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Select
                    value={newTask.priority}
                    onValueChange={(value: 'High' | 'Medium' | 'Low') => setNewTask(prev => ({ ...prev, priority: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="High">Alta</SelectItem>
                      <SelectItem value="Medium">Média</SelectItem>
                      <SelectItem value="Low">Baixa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreateTask} className="w-full">
                  Criar Tarefa
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Kanban Board */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map((column) => {
            const columnTasks = tasks.filter(t => t.status === column.id);
            const Icon = column.icon;

            return (
              <div
                key={column.id}
                className="bg-muted/30 rounded-lg p-4 min-h-[400px]"
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(column.id)}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Icon className={`w-5 h-5 ${column.color}`} />
                  <h3 className="font-semibold">{column.title}</h3>
                  <Badge variant="secondary" className="ml-auto">
                    {columnTasks.length}
                  </Badge>
                </div>

                <div className="space-y-3">
                  {columnTasks.map((task) => (
                    <Card
                      key={task.id}
                      draggable
                      onDragStart={() => handleDragStart(task)}
                      className={`p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
                        draggedTask?.id === task.id ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm line-clamp-2">{task.title}</p>
                          {task.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {task.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge variant="outline" className={`text-xs ${getPriorityColor(task.priority)}`}>
                              {getPriorityLabel(task.priority)}
                            </Badge>
                            {task.assignee && (
                              <span className="text-xs text-muted-foreground">
                                {task.assignee}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            {task.meeting_id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/meeting/${task.meeting_id}`);
                                }}
                              >
                                <ExternalLink className="w-3 h-3 mr-1" />
                                Ver Reunião
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-sentiment-negative hover:text-sentiment-negative ml-auto"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTask(task.id);
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}

                  {columnTasks.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Sem tarefas
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default Tasks;
