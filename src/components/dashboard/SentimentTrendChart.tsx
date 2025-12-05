import { Card } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { RechartsTooltipProps } from "@/types/meeting";

interface DataPoint {
  date: string;
  score: number;
  count: number;
}

interface SentimentTrendChartProps {
  data: DataPoint[];
  title?: string;
}

export const SentimentTrendChart = ({ 
  data, 
  title = "Tendência de Sentimento" 
}: SentimentTrendChartProps) => {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
  };

  const getColor = (score: number) => {
    if (score >= 70) return "#22c55e"; // green
    if (score >= 40) return "#eab308"; // yellow
    return "#ef4444"; // red
  };

  const CustomTooltip = ({ active, payload, label }: RechartsTooltipProps<DataPoint, number>) => {
    if (active && payload && payload.length) {
      const score = payload[0].value;
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-card/95 backdrop-blur-sm border border-border/50 rounded-2xl p-4 shadow-lg">
          <p className="text-sm font-medium text-muted-foreground">{formatDate(label || '')}</p>
          <p className="text-2xl font-bold mt-1" style={{ color: getColor(score) }}>
            {score}/100
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {dataPoint.count} reunião(ões)
          </p>
        </div>
      );
    }
    return null;
  };

  if (data.length === 0) {
    return (
      <Card className="p-6 sm:p-8">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-3 tracking-tight">
          <div className="p-2 rounded-xl bg-primary/10">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          {title}
        </h3>
        <div className="h-[280px] flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Dados insuficientes para mostrar tendência
          </p>
        </div>
      </Card>
    );
  }

  // Calculate average for reference line
  const avgScore = Math.round(
    data.reduce((acc, d) => acc + d.score, 0) / data.length
  );

  return (
    <Card className="p-6 sm:p-8">
      <h3 className="text-lg font-semibold mb-6 flex items-center gap-3 tracking-tight">
        <div className="p-2 rounded-xl bg-primary/10">
          <TrendingUp className="w-5 h-5 text-primary" />
        </div>
        {title}
      </h3>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
              stroke="hsl(var(--border))"
            />
            <YAxis 
              domain={[0, 100]}
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
              stroke="hsl(var(--border))"
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine 
              y={avgScore} 
              stroke="hsl(var(--muted-foreground))" 
              strokeDasharray="5 5"
              label={{ 
                value: `Média: ${avgScore}`, 
                position: 'right',
                fontSize: 10,
                fill: 'hsl(var(--muted-foreground))'
              }}
            />
            <ReferenceLine y={70} stroke="#22c55e" strokeDasharray="2 2" opacity={0.3} />
            <ReferenceLine y={40} stroke="#eab308" strokeDasharray="2 2" opacity={0.3} />
            <Line
              type="monotone"
              dataKey="score"
              stroke="hsl(var(--primary))"
              strokeWidth={3}
              dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
              activeDot={{ r: 8, fill: "hsl(var(--primary))" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-center gap-6 mt-6 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-sentiment-positive" />
          <span className="text-muted-foreground">Bom (70+)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-sentiment-neutral" />
          <span className="text-muted-foreground">Neutro (40-69)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-sentiment-negative" />
          <span className="text-muted-foreground">Crítico (&lt;40)</span>
        </div>
      </div>
    </Card>
  );
};
