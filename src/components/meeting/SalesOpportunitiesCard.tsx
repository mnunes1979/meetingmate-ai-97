import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, DollarSign, Clock, Target } from "lucide-react";

interface SalesOpportunity {
  title: string;
  description: string;
  product_service: string;
  estimated_value: "low" | "medium" | "high";
  urgency: "low" | "medium" | "high";
  probability: "low" | "medium" | "high";
  trigger: string;
  recommended_action: string;
}

interface SalesOpportunitiesCardProps {
  opportunities: SalesOpportunity[];
}

export const SalesOpportunitiesCard = ({ opportunities }: SalesOpportunitiesCardProps) => {
  if (!opportunities || opportunities.length === 0) return null;

  const getValueColor = (value: string) => {
    switch (value) {
      case "high": return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "medium": return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
      case "low": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      default: return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "high": return "bg-red-500/10 text-red-700 dark:text-red-400";
      case "medium": return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
      case "low": return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
      default: return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  const getProbabilityColor = (probability: string) => {
    switch (probability) {
      case "high": return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
      case "medium": return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
      case "low": return "bg-slate-500/10 text-slate-700 dark:text-slate-400";
      default: return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  return (
    <Card className="border-primary/20 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5 text-primary" />
          Oportunidades de Venda
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {opportunities.map((opportunity, index) => (
          <div key={index} className="p-4 rounded-lg border bg-card space-y-3">
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground">{opportunity.title}</h4>
              <p className="text-sm text-muted-foreground">{opportunity.description}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={getValueColor(opportunity.estimated_value)}>
                <DollarSign className="h-3 w-3 mr-1" />
                Valor: {opportunity.estimated_value === "high" ? "Alto" : opportunity.estimated_value === "medium" ? "Médio" : "Baixo"}
              </Badge>
              <Badge variant="outline" className={getUrgencyColor(opportunity.urgency)}>
                <Clock className="h-3 w-3 mr-1" />
                Urgência: {opportunity.urgency === "high" ? "Alta" : opportunity.urgency === "medium" ? "Média" : "Baixa"}
              </Badge>
              <Badge variant="outline" className={getProbabilityColor(opportunity.probability)}>
                <Target className="h-3 w-3 mr-1" />
                Probabilidade: {opportunity.probability === "high" ? "Alta" : opportunity.probability === "medium" ? "Média" : "Baixa"}
              </Badge>
            </div>

            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-foreground">Produto/Serviço: </span>
                <span className="text-muted-foreground">{opportunity.product_service}</span>
              </div>
              <div>
                <span className="font-medium text-foreground">Indicador: </span>
                <span className="text-muted-foreground">{opportunity.trigger}</span>
              </div>
              <div className="p-3 bg-primary/5 rounded-md border border-primary/10">
                <span className="font-medium text-foreground">Ação Recomendada: </span>
                <span className="text-muted-foreground">{opportunity.recommended_action}</span>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
