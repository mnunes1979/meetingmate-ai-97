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
  "hsl(var(--primary) / 0.8)",
  "hsl(var(--primary) / 0.6)",
  "hsl(var(--primary) / 0.4)",
  "hsl(var(--primary) / 0.3)",
];

export const TopicsBarChart = ({ 
  data, 
  title = "Tópicos Mais Discutidos" 
}: TopicsBarChartProps) => {
  const CustomTooltip = ({ active, payload }: RechartsTooltipProps<TopicData, number>) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium">{dataPoint.topic}</p>
          <p className="text-lg font-bold text-primary">
            {payload[0].value} menção(ões)
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
          <MessageSquare className="w-5 h-5 text-primary" />
          {title}
        </h3>
        <div className="h-[250px] flex items-center justify-center">
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
    <Card className="p-4 sm:p-6 card-gradient border-border/50">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-primary" />
        {title}
      </h3>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={sortedData} 
            layout="vertical"
            margin={{ top: 5, right: 20, left: 80, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis 
              type="category" 
              dataKey="topic" 
              tick={{ fontSize: 11 }}
              width={75}
              tickFormatter={(value) => value.length > 12 ? `${value.slice(0, 12)}...` : value}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
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
