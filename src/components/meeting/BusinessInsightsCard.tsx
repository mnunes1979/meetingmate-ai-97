import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Users, DollarSign, Clock, Trophy } from "lucide-react";

interface ClientNeed {
  need: string;
  importance: "low" | "medium" | "high";
  solution: string;
}

interface Objection {
  objection: string;
  type: "price" | "timing" | "technical" | "trust" | "other";
  severity: "low" | "medium" | "high";
  response: string;
}

interface BusinessInsights {
  overall_interest: "low" | "medium" | "high";
  decision_stage: "awareness" | "consideration" | "decision" | "closed";
  budget_indicators: string;
  timeline_indicators: string;
  competition_mentions: string;
  key_influencers: string;
}

interface BusinessInsightsCardProps {
  clientNeeds?: ClientNeed[];
  objections?: Objection[];
  businessInsights?: BusinessInsights;
}

export const BusinessInsightsCard = ({ clientNeeds, objections, businessInsights }: BusinessInsightsCardProps) => {
  const getImportanceColor = (importance: string) => {
    switch (importance) {
      case "high": return "bg-red-500/10 text-red-700 dark:text-red-400";
      case "medium": return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
      case "low": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      default: return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high": return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900";
      case "medium": return "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-900";
      case "low": return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900";
      default: return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  const getInterestColor = (interest: string) => {
    switch (interest) {
      case "high": return "text-green-600 dark:text-green-400";
      case "medium": return "text-yellow-600 dark:text-yellow-400";
      case "low": return "text-red-600 dark:text-red-400";
      default: return "text-gray-600 dark:text-gray-400";
    }
  };

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case "awareness": return "Consciencialização";
      case "consideration": return "Consideração";
      case "decision": return "Decisão";
      case "closed": return "Fechado";
      default: return stage;
    }
  };

  if (!clientNeeds && !objections && !businessInsights) return null;

  return (
    <Card className="border-primary/20 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Lightbulb className="h-5 w-5 text-primary" />
          Insights de Negócio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Business Insights Overview */}
        {businessInsights && (
          <div className="space-y-3 p-4 bg-muted/50 rounded-lg border">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm font-medium text-muted-foreground">Interesse Geral:</span>
                <p className={`font-semibold ${getInterestColor(businessInsights.overall_interest)}`}>
                  {businessInsights.overall_interest === "high" ? "Alto" : businessInsights.overall_interest === "medium" ? "Médio" : "Baixo"}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">Fase de Decisão:</span>
                <p className="font-semibold text-foreground">{getStageLabel(businessInsights.decision_stage)}</p>
              </div>
            </div>

            {businessInsights.budget_indicators && (
              <div>
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />
                  Indicadores de Orçamento:
                </span>
                <p className="text-sm text-foreground mt-1">{businessInsights.budget_indicators}</p>
              </div>
            )}

            {businessInsights.timeline_indicators && (
              <div>
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Indicadores de Prazo:
                </span>
                <p className="text-sm text-foreground mt-1">{businessInsights.timeline_indicators}</p>
              </div>
            )}

            {businessInsights.competition_mentions && (
              <div>
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Trophy className="h-4 w-4" />
                  Concorrência:
                </span>
                <p className="text-sm text-foreground mt-1">{businessInsights.competition_mentions}</p>
              </div>
            )}

            {businessInsights.key_influencers && (
              <div>
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  Decisores-Chave:
                </span>
                <p className="text-sm text-foreground mt-1">{businessInsights.key_influencers}</p>
              </div>
            )}
          </div>
        )}

        {/* Client Needs */}
        {clientNeeds && clientNeeds.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold text-foreground">Necessidades do Cliente</h4>
            <div className="space-y-2">
              {clientNeeds.map((need, index) => (
                <div key={index} className="p-3 rounded-lg border bg-card">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-foreground">{need.need}</p>
                    <Badge variant="outline" className={getImportanceColor(need.importance)}>
                      {need.importance === "high" ? "Alta" : need.importance === "medium" ? "Mitjana" : "Baixa"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Solució: </span>
                    {need.solution}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Objections */}
        {objections && objections.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold text-foreground">Objeções e Preocupações</h4>
            <div className="space-y-2">
              {objections.map((objection, index) => (
                <div key={index} className={`p-3 rounded-lg border ${getSeverityColor(objection.severity)}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium">{objection.objection}</p>
                    <Badge variant="outline" className="text-xs">
                      {objection.type === "price" ? "Preço" : 
                       objection.type === "timing" ? "Prazo" :
                       objection.type === "technical" ? "Técnico" :
                       objection.type === "trust" ? "Confiança" : "Outro"}
                    </Badge>
                  </div>
                  <div className="p-2 bg-background/50 rounded text-xs">
                    <span className="font-medium">Resposta sugerida: </span>
                    {objection.response}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
