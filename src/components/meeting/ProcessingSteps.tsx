import { Card } from "@/components/ui/card";
import { Loader2, Upload, FileAudio, MessageSquare, Sparkles, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ProcessingStepsProps {
  currentStep: 'upload' | 'transcribe' | 'process' | 'complete' | null;
}

export const ProcessingSteps = ({ currentStep }: ProcessingStepsProps) => {
  if (!currentStep) return null;

  const { t } = useTranslation();

  const steps = [
    { id: 'upload', label: t('processing.uploading'), icon: Upload },
    { id: 'transcribe', label: t('processing.transcribing'), icon: FileAudio },
    { id: 'process', label: t('processing.analyzing'), icon: Sparkles },
    { id: 'complete', label: t('processing.complete'), icon: CheckCircle2 },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <Card className="p-6 card-gradient border-border/50">
      <div className="space-y-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = index === currentStepIndex;
          const isComplete = index < currentStepIndex;
          const isPending = index > currentStepIndex;

          return (
            <div key={step.id} className="flex items-center gap-4">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isComplete
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {isActive ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1">
                <p
                  className={`font-medium transition-colors ${
                    isActive
                      ? 'text-foreground'
                      : isComplete
                      ? 'text-accent'
                      : 'text-muted-foreground'
                  }`}
                >
                  {step.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
