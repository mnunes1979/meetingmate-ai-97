import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mic, Square, RotateCcw, Upload, Loader2, FileAudio } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { AudioUploader } from "./AudioUploader";
import logger from "@/lib/logger";

interface VoiceNoteRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  isProcessing: boolean;
}

// Compress audio using lower bitrate WebM/Opus
async function compressAudio(blob: Blob): Promise<Blob> {
  if (blob.size < 10 * 1024 * 1024) {
    logger.log('[Compression] Audio already small enough:', blob.size, 'bytes');
    return blob;
  }

  logger.log('[Compression] Starting compression, original size:', blob.size, 'bytes');
  
  const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const arrayBuffer = await blob.arrayBuffer();
  
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const targetSampleRate = 16000;
    const numberOfChannels = 1;
    
    const offlineContext = new OfflineAudioContext(
      numberOfChannels,
      Math.ceil(audioBuffer.duration * targetSampleRate),
      targetSampleRate
    );
    
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);
    
    const renderedBuffer = await offlineContext.startRendering();
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

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const samples = buffer.getChannelData(0);
  const dataLength = samples.length * bytesPerSample;
  const bufferLength = 44 + dataLength;
  
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, bufferLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  
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

export const VoiceNoteRecorder = ({ onRecordingComplete, isProcessing }: VoiceNoteRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioSize, setAudioSize] = useState<number>(0);
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
          sampleRate: 16000,
          channelCount: 1,
        } 
      });
      
      let mimeType = 'audio/webm;codecs=opus';
      let options: MediaRecorderOptions = { mimeType };
      
      if (MediaRecorder.isTypeSupported(mimeType)) {
        options = { mimeType, audioBitsPerSecond: 32000 };
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
        options = { mimeType, audioBitsPerSecond: 32000 };
      } else {
        logger.warn('WebM not supported, using default');
        options = {};
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      logger.log('[VoiceNote] Using codec:', mediaRecorder.mimeType);

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const rawBlob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        logger.log('[VoiceNote] Recording stopped, raw size:', rawBlob.size, 'bytes');
        
        if (rawBlob.size < 10000) {
          logger.error('[VoiceNote] Audio too small:', rawBlob.size, 'bytes');
          toast({
            title: t('recorder.micError'),
            description: t('recorder.audioTooShort', 'Áudio demasiado curto.'),
            variant: "destructive",
          });
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        setIsCompressing(true);
        try {
          const compressedBlob = await compressAudio(rawBlob);
          const url = URL.createObjectURL(compressedBlob);
          setAudioURL(url);
          setAudioBlob(compressedBlob);
          setAudioSize(compressedBlob.size);
        } catch (error) {
          logger.error('[VoiceNote] Compression error:', error);
          const url = URL.createObjectURL(rawBlob);
          setAudioURL(url);
          setAudioBlob(rawBlob);
          setAudioSize(rawBlob.size);
        } finally {
          setIsCompressing(false);
        }
        
        stream.getTracks().forEach(track => track.stop());
      };

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

  const handleProcess = () => {
    if (audioBlob) {
      onRecordingComplete(audioBlob);
    }
  };

  const handleFileUpload = (file: File) => {
    const blob = new Blob([file], { type: file.type });
    onRecordingComplete(blob);
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

  return (
    <Card className="p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6 card-gradient border-border/50">
      <div className="text-center space-y-2">
        <h2 className="text-xl sm:text-2xl font-semibold">
          {t('voiceNote.title', 'Nota de Voz - Resumo')}
        </h2>
        <p className="text-sm sm:text-base text-muted-foreground">
          {t('voiceNote.subtitle', 'Grave ou carregue uma nota de voz pessoal')}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'record' | 'upload')} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="record" className="gap-2">
            <Mic className="w-4 h-4" />
            {t('voiceNote.record', 'Gravar')}
          </TabsTrigger>
          <TabsTrigger value="upload" className="gap-2">
            <FileAudio className="w-4 h-4" />
            {t('voiceNote.upload', 'Carregar')}
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
                onClick={() => isRecording ? stopRecording() : (!audioURL && startRecording())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    isRecording ? stopRecording() : (!audioURL && startRecording());
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

            {isCompressing && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                A comprimir áudio...
              </div>
            )}

            {audioURL && !isRecording && !isCompressing && (
              <audio src={audioURL} controls className="w-full max-w-md" />
            )}

            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
              {!isRecording && !audioURL && !isCompressing && (
                <Button
                  size="lg"
                  onClick={startRecording}
                  disabled={isProcessing}
                  className="gap-2 w-full sm:w-auto"
                >
                  <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
                  {t('recorder.startRecording', 'Iniciar Gravação')}
                </Button>
              )}

              {isRecording && (
                <Button
                  size="lg"
                  variant="destructive"
                  onClick={stopRecording}
                  className="gap-2 w-full sm:w-auto"
                >
                  <Square className="w-4 h-4 sm:w-5 sm:h-5" />
                  {t('recorder.stopRecording', 'Parar Gravação')}
                </Button>
              )}

              {audioURL && !isRecording && !isCompressing && (
                <>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={resetRecording}
                    disabled={isProcessing}
                    className="gap-2 w-full sm:w-auto"
                  >
                    <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                    {t('recorder.retake', 'Regravar')}
                  </Button>
                  <Button
                    size="lg"
                    onClick={handleProcess}
                    disabled={isProcessing}
                    className="gap-2 w-full sm:w-auto"
                  >
                    <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
                    {t('recorder.process', 'Processar')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="upload" className="mt-4">
          <AudioUploader 
            onFileSelected={handleFileUpload} 
            disabled={isProcessing} 
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
};
