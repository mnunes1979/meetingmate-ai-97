import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertCircle, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ActionItem {
  meetingId: string;
  meetingDate: string;
  task: string;
  assignee: string;
  priority: 'High' | 'Medium' | 'Low';
}

interface ActionItemsWidgetProps {
  items: ActionItem[];
  title?: string;
}

export const ActionItemsWidget = ({ 
  items, 
  title = "Ações Pendentes" 
}: ActionItemsWidgetProps) => {
  const navigate = useNavigate();

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

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'High':
        return <AlertCircle className="w-4 h-4" />;
      case 'Medium':
        return <Clock className="w-4 h-4" />;
      case 'Low':
        return <CheckCircle2 className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  // Sort by priority (High first)
  const sortedItems = [...items].sort((a, b) => {
    const order = { 'High': 0, 'Medium': 1, 'Low': 2 };
    return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
  });

  if (items.length === 0) {
    return (
      <Card className="p-4 sm:p-6 card-gradient border-border/50">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-primary" />
          {title}
        </h3>
        <div className="text-center py-8">
          <CheckCircle2 className="w-10 h-10 text-sentiment-positive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Sem ações pendentes
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-6 card-gradient border-border/50">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-primary" />
        {title}
        <Badge variant="secondary" className="ml-auto">
          {items.length}
        </Badge>
      </h3>
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {sortedItems.slice(0, 10).map((item, idx) => (
          <div
            key={`${item.meetingId}-${idx}`}
            className="p-3 bg-background/50 rounded-lg border border-border/50 hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => navigate(`/meeting/${item.meetingId}`)}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                {getPriorityIcon(item.priority)}
                <Badge variant="outline" className={getPriorityColor(item.priority)}>
                  {getPriorityLabel(item.priority)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(item.meetingDate).toLocaleDateString('pt-PT', {
                  day: 'numeric',
                  month: 'short',
                })}
              </p>
            </div>
            <p className="text-sm font-medium line-clamp-2 mb-1">{item.task}</p>
            <p className="text-xs text-muted-foreground">
              Responsável: {item.assignee || "A definir"}
            </p>
            <div className="flex justify-end mt-2">
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
