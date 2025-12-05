import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  trend?: number;
  trendLabel?: string;
  colorClass?: string;
  onClick?: () => void;
}

export const MetricCard = ({
  title,
  value,
  icon: Icon,
  trend,
  trendLabel,
  colorClass,
  onClick,
}: MetricCardProps) => {
  return (
    <Card
      className={cn(
        "p-4 sm:p-6 card-gradient border-border/50 transition-all",
        onClick && "cursor-pointer hover:shadow-lg hover:border-primary/50"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs sm:text-sm text-muted-foreground">{title}</p>
          <p className={cn("text-2xl sm:text-3xl font-bold", colorClass)}>
            {value}
          </p>
          {trend !== undefined && (
            <p className={cn(
              "text-xs",
              trend > 0 ? "text-sentiment-positive" : trend < 0 ? "text-sentiment-negative" : "text-muted-foreground"
            )}>
              {trend > 0 ? "↑" : trend < 0 ? "↓" : "→"} {Math.abs(trend)}% {trendLabel}
            </p>
          )}
        </div>
        <Icon className={cn("w-6 h-6 sm:w-8 sm:h-8", colorClass || "text-primary")} />
      </div>
    </Card>
  );
};
