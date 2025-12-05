import { Card } from "@/components/ui/card";

interface SentimentGaugeProps {
  score: number;
  label?: string;
}

export const SentimentGauge = ({ score, label }: SentimentGaugeProps) => {
  // Determine color based on score (0-100)
  const getColor = (s: number) => {
    if (s >= 70) return "text-sentiment-positive";
    if (s >= 40) return "text-sentiment-neutral";
    return "text-sentiment-negative";
  };

  const getBgColor = (s: number) => {
    if (s >= 70) return "bg-sentiment-positive";
    if (s >= 40) return "bg-sentiment-neutral";
    return "bg-sentiment-negative";
  };

  const getLabel = (s: number) => {
    if (s >= 80) return "Excelente";
    if (s >= 60) return "Bom";
    if (s >= 40) return "Neutro";
    if (s >= 20) return "Preocupante";
    return "Crítico";
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-2">
      <div className="relative w-24 h-24 sm:w-32 sm:h-32">
        {/* Background circle */}
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="50%"
            cy="50%"
            r="45%"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-muted/20"
          />
          <circle
            cx="50%"
            cy="50%"
            r="45%"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeDasharray={`${score * 2.83} 283`}
            strokeLinecap="round"
            className={getBgColor(score)}
          />
        </svg>
        {/* Score text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-2xl sm:text-3xl font-bold ${getColor(score)}`}>
            {score}
          </span>
        </div>
      </div>
      <p className={`text-sm font-medium ${getColor(score)}`}>
        {label || getLabel(score)}
      </p>
    </div>
  );
};
