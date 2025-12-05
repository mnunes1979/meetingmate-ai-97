import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mic, Square, RotateCcw, Upload, Loader2, ShieldCheck, FileAudio } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { AudioUploader } from "./AudioUploader";
import logger from "@/lib/logger";

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  isProcessing: boolean;
}

// Compress audio using lower bitrate WebM/Opus
async function compressAudio(blob: Blob): Promise<Blob> {
  // If already small enough (< 10MB), return as-is
  if (blob.size < 10 * 1024 * 1024) {
    logger.log('[Compression] Audio already small enough:', blob.size, 'bytes');
    return blob;
  }

  logger.log('[Compression] Starting compression, original size:', blob.size, 'bytes');
  
  // Create audio context for re-encoding
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const arrayBuffer = await blob.arrayBuffer();
  
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Downsample to 16kHz mono for speech (Whisper optimal)
    const targetSampleRate = 16000;
    const numberOfChannels = 1;
    
    // Create offline context for resampling
    const offlineContext = new OfflineAudioContext(
      numberOfChannels,
      Math.ceil(audioBuffer.duration * targetSampleRate),
      targetSampleRate
    );
    
    // Create buffer source
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);
    
    // Render to get resampled buffer
    const renderedBuffer = await offlineContext.startRendering();
    
    // Convert to WAV (more efficient for speech than WebM for long recordings)
    const wavBlob = audioBufferToWav(renderedBuffer);
    
    logger.log('[Compression] Compressed from', blob.size, 'to', wavBlob.size, 'bytes');
    audioContext.close();
    
    return wavBlob;
  } catch (error) {
    logger.error('[Compression] Failed to compress, using original:', error);
    audioContext.close();
    return blob;
  }
}

// Convert AudioBuffer to WAV blob
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const samples = buffer.getChannelData(0);
  const dataLength = samples.length * bytesPerSample;
  const bufferLength = 44 + dataLength;
  
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  
  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, bufferLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  
  // Write audio data
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(offset, intSample, true);
    offset += 2;
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export const VoiceRecorder = ({ onRecordingComplete, isProcessing }: VoiceRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioSize, setAudioSize] = useState<number>(0);
  const [consentGiven, setConsentGiven] = useState(false);
  const [activeTab, setActiveTab] = useState<'record' | 'upload'>('record');
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
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000, // Lower sample rate for speech
          channelCount: 1, // Mono
        } 
      });
      
      // Use low bitrate WebM/Opus for compression
      let mimeType = 'audio/webm;codecs=opus';
      let options: MediaRecorderOptions = { mimeType };
      
      // Try to set lower bitrate if supported
      if (MediaRecorder.isTypeSupported(mimeType)) {
        options = { 
          mimeType,
          audioBitsPerSecond: 32000 // 32kbps for speech (very compressed)
        };
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
        options = { mimeType, audioBitsPerSecond: 32000 };
      } else {
        logger.warn('WebM not supported, using default');
        options = {};
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      logger.log('[Recorder] Using codec:', mediaRecorder.mimeType, 'with options:', options);

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          logger.log('[Recorder] Chunk received:', e.data.size, 'bytes');
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const rawBlob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        logger.log('[Recorder] Recording stopped, raw size:', rawBlob.size, 'bytes, type:', rawBlob.type);
        
        // Validate blob size before allowing upload
        if (rawBlob.size < 10000) {
          logger.error('[Recorder] Audio too small:', rawBlob.size, 'bytes');
          toast({
            title: t('recorder.micError'),
            description: t('recorder.audioTooShort', 'Áudio demasiado curto. Por favor, grave pelo menos 5 segundos com voz clara.'),
            variant: "destructive",
          });
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        // Compress if needed (for long recordings > 10MB)
        setIsCompressing(true);
        try {
          const compressedBlob = await compressAudio(rawBlob);
          const url = URL.createObjectURL(compressedBlob);
          setAudioURL(url);
          setAudioBlob(compressedBlob);
          setAudioSize(compressedBlob.size);
          logger.log('[Recorder] Final audio size:', compressedBlob.size, 'bytes');
        } catch (error) {
          logger.error('[Recorder] Compression error:', error);
          const url = URL.createObjectURL(rawBlob);
          setAudioURL(url);
          setAudioBlob(rawBlob);
          setAudioSize(rawBlob.size);
        } finally {
          setIsCompressing(false);
        }
        
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
      logger.error("Error accessing microphone:", error);
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
    setAudioSize(0);
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
    logger.log('[VoiceRecorder] handleProcess called, audioBlob exists:', !!audioBlob, 'size:', audioBlob?.size);
    if (audioBlob) {
      logger.log('[VoiceRecorder] Calling onRecordingComplete with blob');
      onRecordingComplete(audioBlob);
    } else {
      logger.error('[VoiceRecorder] No audioBlob available!');
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

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileUpload = (file: File) => {
    if (!consentGiven) {
      toast({
        title: t('recorder.consentRequired', 'Consentimento necessário'),
        description: t('recorder.consentRequiredDesc', 'Por favor, confirme o consentimento antes de processar.'),
        variant: "destructive",
      });
      return;
    }
    const blob = new Blob([file], { type: file.type });
    onRecordingComplete(blob);
  };

  return (
    <Card className="p-6 sm:p-8 space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">{t('recorder.title')}</h2>
        <p className="text-sm sm:text-base text-muted-foreground">
          {t('recorder.subtitle')}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'record' | 'upload')} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="record" className="gap-2">
            <Mic className="w-4 h-4" />
            {t('recorder.recordTab', 'Gravar')}
          </TabsTrigger>
          <TabsTrigger value="upload" className="gap-2">
            <FileAudio className="w-4 h-4" />
            {t('recorder.uploadTab', 'Carregar')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="record" className="space-y-4 mt-4">
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
                onClick={() => {
                  if (!consentGiven && !isRecording) return;
                  toggleRecording();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!consentGiven && !isRecording) return;
                    toggleRecording();
                  }
                }}
              >
                {isRecording ? (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-destructive/30 flex items-center justify-center">
                    <Mic className="w-10 h-10 sm:w-12 sm:h-12 text-destructive" />
                  </div>
                ) : isCompressing ? (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-primary/30 flex items-center justify-center">
                    <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 text-primary animate-spin" />
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

            {/* Timer and Size */}
            {(isRecording || audioURL) && (
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-mono font-bold text-primary">
                  {formatTime(recordingTime)}
                </div>
                {audioSize > 0 && (
                  <div className="text-sm text-muted-foreground mt-1">
                    {formatSize(audioSize)}
                  </div>
                )}
              </div>
            )}

            {/* Compression indicator */}
            {isCompressing && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                A comprimir áudio...
              </div>
            )}

            {/* Audio playback */}
            {audioURL && !isRecording && !isCompressing && (
              <audio src={audioURL} controls className="w-full max-w-md" />
            )}

            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
              {!isRecording && !audioURL && !isCompressing && (
                <Button
                  size="lg"
                  onClick={startRecording}
                  disabled={isProcessing || !consentGiven}
                  className="gap-2 w-full sm:w-auto text-sm sm:text-base"
                  title={!consentGiven ? t('recorder.consentRequired', 'Por favor, confirme o consentimento antes de gravar') : undefined}
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

              {audioURL && !isRecording && !isCompressing && (
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

            {/* RGPD Consent Checkbox - moved below controls */}
            <div className="flex items-start space-x-3 p-4 bg-muted/30 rounded-2xl border border-border/30 w-full max-w-md">
              <Checkbox
                id="consent"
                checked={consentGiven}
                onCheckedChange={(checked) => setConsentGiven(checked === true)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label 
                  htmlFor="consent" 
                  className="text-sm font-medium leading-relaxed cursor-pointer flex items-start gap-2"
                >
                  <ShieldCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>
                    {t('recorder.consentLabel', 'Declaro que tenho o consentimento de todos os participantes para gravar e processar esta reunião, em conformidade com o RGPD.')}
                  </span>
                </Label>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="upload" className="mt-4">
          <AudioUploader 
            onFileSelected={handleFileUpload} 
            disabled={isProcessing || !consentGiven} 
          />
          {!consentGiven && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              {t('recorder.consentRequired', 'Por favor, confirme o consentimento acima para carregar ficheiros')}
            </p>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
};
