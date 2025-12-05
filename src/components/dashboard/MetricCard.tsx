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
        "widget-card group relative overflow-hidden",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="relative flex items-start justify-between">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className={cn(
            "text-3xl sm:text-4xl font-bold tracking-tight",
            colorClass
          )}>
            {value}
          </p>
          {trend !== undefined && (
            <div className={cn(
              "inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
              trend > 0 
                ? "bg-sentiment-positive/10 text-sentiment-positive" 
                : trend < 0 
                  ? "bg-sentiment-negative/10 text-sentiment-negative" 
                  : "bg-muted text-muted-foreground"
            )}>
              {trend > 0 ? "↑" : trend < 0 ? "↓" : "→"} {Math.abs(trend)}% {trendLabel}
            </div>
          )}
        </div>
        <div className={cn(
          "p-3 rounded-2xl bg-primary/10 group-hover:bg-primary/15 transition-colors duration-300",
          colorClass ? "bg-current/10" : ""
        )}>
          <Icon className={cn(
            "w-6 h-6 sm:w-7 sm:h-7",
            colorClass || "text-primary"
          )} />
        </div>
      </div>
    </Card>
  );
};
