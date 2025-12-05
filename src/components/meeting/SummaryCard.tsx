import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Smile, Meh, Frown, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SummaryCardProps {
  summary: {
    overview: string;
    topics_discussed: string[];
    key_points: string[];
    strengths: string[];
    weaknesses: string[];
    action_items: string[];
  } | string;
  sentiment: 'positive' | 'neutral' | 'negative';
  language: string;
  confidence?: number;
}

export const SummaryCard = ({ summary, sentiment, language, confidence }: SummaryCardProps) => {
  const { t } = useTranslation();
  
  // Handle both old string format and new structured format
  const isStructured = typeof summary === 'object' && summary !== null;
  const summaryData = isStructured ? summary : {
    overview: '',
    topics_discussed: [],
    key_points: typeof summary === 'string' ? summary.split('\n').filter(s => s.trim()) : [],
    strengths: [],
    weaknesses: [],
    action_items: []
  };
  const getSentimentIcon = () => {
    switch (sentiment) {
      case 'positive':
        return <Smile className="w-4 h-4" />;
      case 'neutral':
        return <Meh className="w-4 h-4" />;
      case 'negative':
        return <Frown className="w-4 h-4" />;
    }
  };

  const getSentimentColor = () => {
    switch (sentiment) {
      case 'positive':
        return 'bg-sentiment-positive/10 text-sentiment-positive border-sentiment-positive/20';
      case 'neutral':
        return 'bg-sentiment-neutral/10 text-sentiment-neutral border-sentiment-neutral/20';
      case 'negative':
        return 'bg-sentiment-negative/10 text-sentiment-negative border-sentiment-negative/20';
    }
  };

  const languageNames: Record<string, string> = {
    pt: 'Portuguès',
    es: 'Espanyol',
    ca: 'Català',
    fr: 'Francès',
    en: 'Anglès',
  };

  const getSentimentLabel = () => {
    switch (sentiment) {
      case 'positive': return t('sentiment.positive');
      case 'neutral': return t('sentiment.neutral');
      case 'negative': return t('sentiment.negative');
      default: return sentiment;
    }
  };

  return (
    <Card className="p-4 sm:p-6 space-y-4 card-gradient border-border/50">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
        <h3 className="text-base sm:text-lg font-semibold">{t('summary.title')}</h3>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1.5 text-xs">
            <Globe className="w-3 h-3" />
            {languageNames[language] || language.toUpperCase()}
          </Badge>
          <Badge variant="outline" className={`gap-1.5 text-xs ${getSentimentColor()}`}>
            {getSentimentIcon()}
            {getSentimentLabel()}
          </Badge>
          {confidence !== undefined && confidence < 0.6 && (
            <Badge variant="outline" className="bg-status-processing/10 text-status-processing border-status-processing/20 text-xs">
              {t('common.review')}
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {summaryData.overview && (
          <div className="p-3 sm:p-4 rounded-lg bg-background/50 border border-border/50">
            <p className="text-xs sm:text-sm leading-relaxed">{summaryData.overview}</p>
          </div>
        )}

        {summaryData.topics_discussed && summaryData.topics_discussed.length > 0 && (
          <div>
            <h4 className="text-xs sm:text-sm font-semibold text-muted-foreground mb-2">{t('summary.topicsDiscussed')}</h4>
            <div className="flex flex-wrap gap-2">
              {summaryData.topics_discussed.map((topic, idx) => (
                <span key={idx} className="px-2 sm:px-3 py-1 rounded-full bg-primary/10 text-primary text-xs sm:text-sm">
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {summaryData.key_points && summaryData.key_points.length > 0 && (
          <div>
            <h4 className="text-xs sm:text-sm font-semibold text-muted-foreground mb-2">{t('summary.keyPoints')}</h4>
            <ul className="space-y-2 list-disc list-inside text-foreground/90">
              {summaryData.key_points.map((point, idx) => (
                <li key={idx} className="leading-relaxed text-xs sm:text-sm">
                  {point.replace(/^[-•]\s*/, '').trim()}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {summaryData.strengths && summaryData.strengths.length > 0 && (
            <div className="p-3 sm:p-4 rounded-lg bg-sentiment-positive/5 border border-sentiment-positive/20">
              <h4 className="text-xs sm:text-sm font-semibold text-sentiment-positive mb-2">{t('summary.strengths')}</h4>
              <ul className="space-y-1.5">
                {summaryData.strengths.map((strength, idx) => (
                  <li key={idx} className="text-xs sm:text-sm text-foreground/80 flex items-start gap-2">
                    <span className="text-sentiment-positive mt-0.5">+</span>
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summaryData.weaknesses && summaryData.weaknesses.length > 0 && (
            <div className="p-3 sm:p-4 rounded-lg bg-sentiment-negative/5 border border-sentiment-negative/20">
              <h4 className="text-xs sm:text-sm font-semibold text-sentiment-negative mb-2">{t('summary.weaknesses')}</h4>
              <ul className="space-y-1.5">
                {summaryData.weaknesses.map((weakness, idx) => (
                  <li key={idx} className="text-xs sm:text-sm text-foreground/80 flex items-start gap-2">
                    <span className="text-sentiment-negative mt-0.5">-</span>
                    <span>{weakness}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {summaryData.action_items && summaryData.action_items.length > 0 && (
          <div className="p-3 sm:p-4 rounded-lg bg-action-email/5 border border-action-email/20">
            <h4 className="text-xs sm:text-sm font-semibold text-action-email mb-2">{t('summary.actionItems')}</h4>
            <ul className="space-y-1.5">
              {summaryData.action_items.map((action, idx) => (
                <li key={idx} className="text-xs sm:text-sm text-foreground/80 flex items-start gap-2">
                  <span className="text-action-email mt-0.5">→</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
};
