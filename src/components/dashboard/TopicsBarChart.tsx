import { Card } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { RechartsTooltipProps } from "@/types/meeting";

interface TopicData {
  topic: string;
  count: number;
}

interface TopicsBarChartProps {
  data: TopicData[];
  title?: string;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--primary) / 0.85)",
  "hsl(var(--primary) / 0.7)",
  "hsl(var(--primary) / 0.55)",
  "hsl(var(--primary) / 0.4)",
  "hsl(var(--primary) / 0.3)",
  "hsl(var(--primary) / 0.2)",
  "hsl(var(--primary) / 0.15)",
];

export const TopicsBarChart = ({ 
  data, 
  title = "Tópicos Mais Discutidos" 
}: TopicsBarChartProps) => {
  const CustomTooltip = ({ active, payload }: RechartsTooltipProps<TopicData, number>) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-card/95 backdrop-blur-sm border border-border/50 rounded-2xl p-4 shadow-lg">
          <p className="text-sm font-medium">{dataPoint.topic}</p>
          <p className="text-2xl font-bold text-primary mt-1">
            {payload[0].value} menção(ões)
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
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          {title}
        </h3>
        <div className="h-[280px] flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Sem dados de tópicos disponíveis
          </p>
        </div>
      </Card>
    );
  }

  // Sort and take top 8
  const sortedData = [...data]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return (
    <Card className="p-6 sm:p-8">
      <h3 className="text-lg font-semibold mb-6 flex items-center gap-3 tracking-tight">
        <div className="p-2 rounded-xl bg-primary/10">
          <MessageSquare className="w-5 h-5 text-primary" />
        </div>
        {title}
      </h3>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={sortedData} 
            layout="vertical"
            margin={{ top: 5, right: 20, left: 80, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
            <XAxis 
              type="number" 
              tick={{ fontSize: 12 }} 
              stroke="hsl(var(--border))"
            />
            <YAxis 
              type="category" 
              dataKey="topic" 
              tick={{ fontSize: 11 }}
              width={75}
              tickFormatter={(value) => value.length > 12 ? `${value.slice(0, 12)}...` : value}
              stroke="hsl(var(--border))"
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[0, 8, 8, 0]}>
              {sortedData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
