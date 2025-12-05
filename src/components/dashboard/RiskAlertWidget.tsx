import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Risk {
  meetingId: string;
  meetingDate: string;
  customerName: string;
  risk: string;
  sentimentScore: number;
}

interface RiskAlertWidgetProps {
  risks: Risk[];
  title?: string;
}

export const RiskAlertWidget = ({ risks, title = "Alertas de Risco" }: RiskAlertWidgetProps) => {
  const navigate = useNavigate();

  const getSeverityColor = (score: number) => {
    if (score <= 30) return "bg-sentiment-negative/10 text-sentiment-negative border-sentiment-negative/20";
    if (score <= 50) return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    return "bg-muted text-muted-foreground";
  };

  const getSeverityLabel = (score: number) => {
    if (score <= 30) return "Crítico";
    if (score <= 50) return "Atenção";
    return "Moderado";
  };

  if (risks.length === 0) {
    return (
      <Card className="p-4 sm:p-6 card-gradient border-border/50">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          {title}
        </h3>
        <div className="text-center py-8">
          <AlertCircle className="w-10 h-10 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Sem alertas de risco nos últimos 30 dias
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-6 card-gradient border-border/50">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        {title}
        <Badge variant="secondary" className="ml-auto">
          {risks.length}
        </Badge>
      </h3>
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {risks.map((risk, idx) => (
          <div
            key={`${risk.meetingId}-${idx}`}
            className="p-3 bg-background/50 rounded-lg border border-border/50 hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => navigate(`/meeting/${risk.meetingId}`)}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1">
                <p className="font-medium text-sm">{risk.customerName || "Cliente não identificado"}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(risk.meetingDate).toLocaleDateString('pt-PT', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <Badge variant="outline" className={getSeverityColor(risk.sentimentScore)}>
                {getSeverityLabel(risk.sentimentScore)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">{risk.risk}</p>
            <div className="flex justify-end mt-2">
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
