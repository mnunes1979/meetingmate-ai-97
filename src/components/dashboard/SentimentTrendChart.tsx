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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const score = payload[0].value;
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium">{formatDate(label)}</p>
          <p className="text-lg font-bold" style={{ color: getColor(score) }}>
            {score}/100
          </p>
          <p className="text-xs text-muted-foreground">
            {payload[0].payload.count} reunião(ões)
          </p>
        </div>
      );
    }
    return null;
  };

  if (data.length === 0) {
    return (
      <Card className="p-4 sm:p-6 card-gradient border-border/50">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          {title}
        </h3>
        <div className="h-[250px] flex items-center justify-center">
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
    <Card className="p-4 sm:p-6 card-gradient border-border/50">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-primary" />
        {title}
      </h3>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
            />
            <YAxis 
              domain={[0, 100]}
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
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
              strokeWidth={2}
              dot={{ fill: "hsl(var(--primary))", strokeWidth: 2 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-center gap-4 mt-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-sentiment-positive" />
          <span>Bom (70+)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-sentiment-neutral" />
          <span>Neutro (40-69)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-sentiment-negative" />
          <span>Crítico (&lt;40)</span>
        </div>
      </div>
    </Card>
  );
};
