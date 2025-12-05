import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, Square, RotateCcw, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  isProcessing: boolean;
}

export const VoiceRecorder = ({ onRecordingComplete, isProcessing }: VoiceRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioURL) URL.revokeObjectURL(audioURL);
    };
  }, [audioURL]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Try to use the best available codec with fallback
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.warn('audio/webm;codecs=opus not supported, falling back to audio/webm');
        mimeType = 'audio/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.warn('audio/webm not supported, using default');
        mimeType = '';
      }

      const mediaRecorder = new MediaRecorder(stream, 
        mimeType ? { mimeType } : undefined
      );

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          console.log('[Recorder] Chunk received:', e.data.size, 'bytes');
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        console.log('[Recorder] Recording stopped, total size:', blob.size, 'bytes, type:', blob.type);
        
        // Validate blob size before allowing upload
        if (blob.size < 10000) {
          console.error('[Recorder] Audio too small:', blob.size, 'bytes');
          toast({
            title: t('recorder.micError'),
            description: t('recorder.audioTooShort', 'Áudio demasiado curto. Por favor, grave pelo menos 5 segundos com voz clara.'),
            variant: "destructive",
          });
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        const url = URL.createObjectURL(blob);
        setAudioURL(url);
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      // Use larger timeslice to ensure stable chunks
      mediaRecorder.start(500);
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error("Error accessing microphone:", error);
      toast({
        title: t('recorder.micError'),
        description: t('recorder.micErrorDesc'),
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const resetRecording = () => {
    if (audioURL) URL.revokeObjectURL(audioURL);
    setAudioURL(null);
    setAudioBlob(null);
    setRecordingTime(0);
  };

  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else if (!audioURL) {
      await startRecording();
    } else {
      // If there is an existing recording, start a new one
      resetRecording();
      await startRecording();
    }
  };

  const handleProcess = () => {
    console.log('[VoiceRecorder] handleProcess called, audioBlob exists:', !!audioBlob, 'size:', audioBlob?.size);
    if (audioBlob) {
      console.log('[VoiceRecorder] Calling onRecordingComplete with blob');
      onRecordingComplete(audioBlob);
    } else {
      console.error('[VoiceRecorder] No audioBlob available!');
      toast({
        title: t('recorder.micError'),
        description: t('recorder.audioNotAvailable', 'Erro: áudio não disponível. Por favor, grave novamente.'),
        variant: "destructive",
      });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6 card-gradient border-border/50">
      <div className="text-center space-y-2">
        <h2 className="text-xl sm:text-2xl font-semibold">{t('recorder.title')}</h2>
        <p className="text-sm sm:text-base text-muted-foreground">
          {t('recorder.subtitle')}
        </p>
      </div>

      <div className="flex flex-col items-center space-y-4 sm:space-y-6">
        {/* Recording visualizer */}
        <div className="relative">
          <div 
            className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full flex items-center justify-center transition-all duration-300 ${
              isRecording 
                ? 'bg-destructive/20 shadow-glow animate-pulse' 
                : audioURL 
                ? 'bg-accent/20' 
                : 'bg-primary/20'
            }`}
            role="button"
            tabIndex={0}
            aria-pressed={isRecording}
            title={isRecording ? t('recorder.stopRecording') : t('recorder.startRecording')}
            onClick={toggleRecording}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleRecording();
              }
            }}
          >
            {isRecording ? (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-destructive/30 flex items-center justify-center">
                <Mic className="w-10 h-10 sm:w-12 sm:h-12 text-destructive" />
              </div>
            ) : audioURL ? (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-accent/30 flex items-center justify-center">
                <Square className="w-10 h-10 sm:w-12 sm:h-12 text-accent fill-accent" />
              </div>
            ) : (
              <Mic className="w-10 h-10 sm:w-12 sm:h-12 text-primary" />
            )}
          </div>
        </div>

        {/* Timer */}
        {(isRecording || audioURL) && (
          <div className="text-2xl sm:text-3xl font-mono font-bold text-primary">
            {formatTime(recordingTime)}
          </div>
        )}

        {/* Audio playback */}
        {audioURL && !isRecording && (
          <audio src={audioURL} controls className="w-full max-w-md" />
        )}

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
          {!isRecording && !audioURL && (
            <Button
              size="lg"
              onClick={startRecording}
              disabled={isProcessing}
              className="gap-2 w-full sm:w-auto text-sm sm:text-base"
            >
              <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
              {t('recorder.startRecording')}
            </Button>
          )}

          {isRecording && (
            <Button
              size="lg"
              variant="destructive"
              onClick={stopRecording}
              className="gap-2 w-full sm:w-auto text-sm sm:text-base"
            >
              <Square className="w-4 h-4 sm:w-5 sm:h-5" />
              {t('recorder.stopRecording')}
            </Button>
          )}

          {audioURL && !isRecording && (
            <>
              <Button
                size="lg"
                variant="outline"
                onClick={resetRecording}
                disabled={isProcessing}
                className="gap-2 w-full sm:w-auto text-sm sm:text-base"
              >
                <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                {t('recorder.retake')}
              </Button>
              <Button
                size="lg"
                onClick={handleProcess}
                disabled={isProcessing}
                className="gap-2 w-full sm:w-auto text-sm sm:text-base"
              >
                <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
                {t('recorder.process')}
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
};
