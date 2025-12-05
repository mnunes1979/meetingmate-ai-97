import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { GripVertical, Clock, CheckCircle2, AlertCircle, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { ActionItem } from "@/types/meeting";

interface Task {
  id: string;
  title: string;
  description: string | null;
  assignee: string | null;
  priority: string;
  status: string;
}

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
}

interface MeetingKanbanProps {
  meetingId: string;
  actionItems: (ActionItem | string)[];
  userId: string;
}

type ColumnStatus = 'todo' | 'in_progress' | 'done';

const COLUMNS = [
  { id: 'todo' as const, title: 'A Fazer', icon: Clock, color: 'text-muted-foreground' },
  { id: 'in_progress' as const, title: 'Em Progresso', icon: AlertCircle, color: 'text-amber-500' },
  { id: 'done' as const, title: 'Concluído', icon: CheckCircle2, color: 'text-sentiment-positive' },
];

export const MeetingKanban = ({ meetingId, actionItems, userId }: MeetingKanbanProps) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTask, setNewTask] = useState<{ title: string; description: string; assignee_id: string; priority: 'High' | 'Medium' | 'Low' }>({ title: '', description: '', assignee_id: '', priority: 'Medium' });
  const { toast } = useToast();

  useEffect(() => {
    loadTasks();
    loadTeamMembers();
  }, [meetingId]);

  const loadTasks = async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setTasks(data as Task[]);
    }
  };

  const loadTeamMembers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, name, email, avatar_url")
      .eq("active", true);

    if (data) {
      setTeamMembers(data as TeamMember[]);
    }
  };

  const importActionItems = async () => {
    if (actionItems.length === 0) return;

    const tasksToCreate = actionItems.map((item) => ({
      user_id: userId,
      meeting_id: meetingId,
      title: typeof item === 'string' ? item : item.task || item.title || 'Tarefa',
      description: null,
      assignee: typeof item === 'string' ? null : item.assignee || null,
      priority: typeof item === 'string' ? 'Medium' : (item.priority || 'Medium'),
      status: 'todo',
    }));

    const { data, error } = await supabase.from('tasks').insert(tasksToCreate).select();
    
    if (error) {
      toast({ title: "Erro", description: "Erro ao importar tarefas", variant: "destructive" });
    } else if (data) {
      setTasks(prev => [...prev, ...(data as Task[])]);
      toast({ title: "Importado", description: `${data.length} tarefa(s) importada(s)` });
    }
  };

  const handleDragStart = useCallback((task: Task) => setDraggedTask(task), []);

  // Optimistic UI update with rollback on error
  const handleDrop = useCallback(async (status: ColumnStatus) => {
    if (!draggedTask || draggedTask.status === status) {
      setDraggedTask(null);
      return;
    }

    const previousStatus = draggedTask.status;
    const taskId = draggedTask.id;

    // Optimistic update - immediately update UI
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
    setDraggedTask(null);

    // Perform database update
    const { error } = await supabase
      .from("tasks")
      .update({ status })
      .eq("id", taskId);

    // Rollback on error
    if (error) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: previousStatus } : t));
      toast({
        title: "Erro",
        description: "Não foi possível atualizar a tarefa. Tente novamente.",
        variant: "destructive",
      });
    }
  }, [draggedTask, toast]);

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) return;

    const member = teamMembers.find(m => m.id === newTask.assignee_id);

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
        meeting_id: meetingId,
        title: newTask.title,
        description: newTask.description || null,
        assignee: member?.name || null,
        priority: newTask.priority,
        status: 'todo',
      })
      .select()
      .single();

    if (!error && data) {
      setTasks(prev => [...prev, data as Task]);
      setNewTask({ title: '', description: '', assignee_id: '', priority: 'Medium' });
      setIsCreateOpen(false);

      // Create notification if assigned
      if (newTask.assignee_id && newTask.assignee_id !== userId) {
        await supabase.from('notifications').insert({
          user_id: newTask.assignee_id,
          type: 'task_assigned',
          title: 'Nova tarefa atribuída',
          message: newTask.title,
          reference_type: 'task',
          reference_id: data.id,
        });
      }
    }
  };

  const handleUpdateTask = async (task: Task, updates: Partial<Task>) => {
    const { error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", task.id);

    if (!error) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...updates } : t));
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (!error) {
      setTasks(prev => prev.filter(t => t.id !== taskId));
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High': return "bg-sentiment-negative/10 text-sentiment-negative";
      case 'Medium': return "bg-amber-500/10 text-amber-500";
      case 'Low': return "bg-sentiment-positive/10 text-sentiment-positive";
      default: return "bg-muted text-muted-foreground";
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

  const getInitials = (name: string | null, email: string) => {
    if (name) return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    return email.slice(0, 2).toUpperCase();
  };

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Plano de Ação</h3>
        <div className="flex gap-2">
          {actionItems.length > 0 && tasks.length === 0 && (
            <Button variant="outline" size="sm" onClick={importActionItems}>
              <Plus className="w-4 h-4 mr-1" />
              Importar ({actionItems.length})
            </Button>
          )}
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Nova
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Tarefa</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input
                    value={newTask.title}
                    onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Descrição da tarefa..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Detalhes..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Atribuir a</Label>
                  <Select
                    value={newTask.assignee_id}
                    onValueChange={(value) => setNewTask(prev => ({ ...prev, assignee_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar membro..." />
                    </SelectTrigger>
                    <SelectContent>
                      {teamMembers.map(member => (
                        <SelectItem key={member.id} value={member.id}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={member.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">
                                {getInitials(member.name, member.email)}
                              </AvatarFallback>
                            </Avatar>
                            {member.name || member.email}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <Button onClick={handleCreateTask} className="w-full">Criar Tarefa</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {COLUMNS.map((column) => {
          const columnTasks = tasks.filter(t => t.status === column.id);
          const Icon = column.icon;

          return (
            <div
              key={column.id}
              className="bg-muted/30 rounded-lg p-3 min-h-[200px]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(column.id)}
            >
              <div className="flex items-center gap-2 mb-3">
                <Icon className={`w-4 h-4 ${column.color}`} />
                <span className="text-sm font-medium">{column.title}</span>
                <Badge variant="secondary" className="ml-auto text-xs">
                  {columnTasks.length}
                </Badge>
              </div>

              <div className="space-y-2">
                {columnTasks.map((task) => (
                  <Card
                    key={task.id}
                    draggable
                    onDragStart={() => handleDragStart(task)}
                    className={`p-2 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow text-sm ${
                      draggedTask?.id === task.id ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs line-clamp-2">{task.title}</p>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] ${getPriorityColor(task.priority)}`}>
                            {getPriorityLabel(task.priority)}
                          </Badge>
                          {task.assignee && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-[60px]">
                              {task.assignee}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-sentiment-negative"
                        onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </Card>
                ))}

                {columnTasks.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground text-xs">
                    Sem tarefas
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
