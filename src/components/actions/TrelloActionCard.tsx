import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trello, Calendar, CheckCircle2, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface TrelloTask {
  title: string;
  description?: string;
  priority: "low" | "medium" | "high";
  due_date_iso?: string;
  assignee?: string;
  context?: string;
}

interface TrelloActionCardProps {
  task: TrelloTask;
  noteId?: string;
  onAdd?: () => void;
}

const priorityConfig = {
  high: { label: "Alta", color: "bg-sentiment-negative/10 text-sentiment-negative border-sentiment-negative/20" },
  medium: { label: "Média", color: "bg-priority-medium/10 text-priority-medium border-priority-medium/20" },
  low: { label: "Baixa", color: "bg-sentiment-positive/10 text-sentiment-positive border-sentiment-positive/20" },
};

export const TrelloActionCard = ({ task, noteId, onAdd }: TrelloActionCardProps) => {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [dueDate, setDueDate] = useState(
    task.due_date_iso ? new Date(task.due_date_iso).toISOString().split('T')[0] : ""
  );
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('ca-ES', {
      dateStyle: 'long',
    });
  };

  const handleCreateTask = async () => {
    setIsCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke('create-trello-card', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: {
          title,
          description,
          due_date: dueDate || undefined,
          note_id: noteId || undefined,
        },
      });

      if (error) throw error;

      toast({
        title: "✅ Tarefa Criada",
        description: `"${title}" foi adicionada ao Trello`,
      });

      if (onAdd) onAdd();

      // Open Trello card in new tab if URL is provided
      if (data?.card_url) {
        setTimeout(() => {
          window.open(data.card_url, '_blank');
        }, 500);
      }
    } catch (error: any) {
      console.error('Error creating Trello card:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao criar tarefa no Trello. Verifique se está conectado nas configurações.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Card className="p-6 space-y-4 card-gradient border-border/50">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-[#0079BF]/10">
            <Trello className="w-5 h-5 text-[#0079BF]" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold">Adicionar Tarefa ao Trello</h3>
              <Badge variant="outline" className={priorityConfig[task.priority].color}>
                {priorityConfig[task.priority].label}
              </Badge>
            </div>
            {task.context && (
              <p className="text-xs text-muted-foreground italic">{task.context}</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Título da Tarefa</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Digite o título da tarefa"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Descrição</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Adicione detalhes sobre a tarefa..."
            rows={3}
          />
        </div>

        {task.assignee && (
          <div className="p-3 rounded-lg bg-background/50 border border-border/50">
            <p className="text-sm font-medium text-muted-foreground mb-1">Responsável Sugerido</p>
            <p className="text-sm font-medium">{task.assignee}</p>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            Data de Entrega
          </label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          {task.due_date_iso && !dueDate && (
            <p className="text-xs text-muted-foreground">
              Sugestão: {formatDate(task.due_date_iso)}
            </p>
          )}
        </div>
      </div>

      <Button
        onClick={handleCreateTask}
        disabled={isCreating || !title}
        className="w-full gap-2"
      >
        {isCreating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            A criar tarefa...
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Criar no Trello
          </>
        )}
      </Button>
    </Card>
  );
};