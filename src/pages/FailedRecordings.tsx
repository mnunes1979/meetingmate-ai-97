import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, RotateCcw, Loader2, FileAudio, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface FailedRecording {
  id: string;
  storage_path: string;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  recording_type: string;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

export default function FailedRecordings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [recordings, setRecordings] = useState<FailedRecording[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [retryDialog, setRetryDialog] = useState<{ open: boolean; recording: FailedRecording | null }>({ open: false, recording: null });
  const [selectedType, setSelectedType] = useState<'meeting' | 'voice_note'>('meeting');

  useEffect(() => {
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    try {
      const { data, error } = await supabase
        .from('failed_audio_recordings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRecordings(data || []);
    } catch (error) {
      console.error('Error loading failed recordings:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as gravações falhadas.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const recording = recordings.find(r => r.id === id);
      if (!recording) return;

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('audio-recordings')
        .remove([recording.storage_path]);

      if (storageError) {
        console.warn('Storage delete error:', storageError);
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('failed_audio_recordings')
        .delete()
        .eq('id', id);

      if (dbError) throw dbError;

      setRecordings(prev => prev.filter(r => r.id !== id));
      toast({
        title: "Sucesso",
        description: "Gravação eliminada com sucesso.",
      });
    } catch (error) {
      console.error('Error deleting recording:', error);
      toast({
        title: "Erro",
        description: "Não foi possível eliminar a gravação.",
        variant: "destructive",
      });
    } finally {
      setDeleteDialog({ open: false, id: null });
    }
  };

  const handleRetry = async (recording: FailedRecording, type: 'meeting' | 'voice_note') => {
    setProcessingId(recording.id);
    setRetryDialog({ open: false, recording: null });

    try {
      const useDiarization = type === 'meeting';
      
      // Get file from storage
      const { data: audioData, error: downloadError } = await supabase.storage
        .from('audio-recordings')
        .download(recording.storage_path);

      if (downloadError || !audioData) {
        throw new Error('Erro ao descarregar o áudio');
      }

      // Transcribe
      const { data: transcribeResult, error: transcribeError } = await supabase.functions.invoke('transcribe-audio', {
        body: {
          storagePath: recording.storage_path,
          mime: recording.mime_type || 'audio/webm',
          useDiarization,
        },
      });

      if (transcribeError) throw transcribeError;
      if (!transcribeResult?.text) throw new Error('Transcrição vazia');

      // Process with AI
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      const { data: processResult, error: processError } = await supabase.functions.invoke('process-meeting', {
        body: {
          transcript: transcribeResult.text,
          language: transcribeResult.language || 'pt',
          salesRepName: profile?.name || 'Utilizador',
        },
      });

      if (processError) throw processError;

      // Save to meeting_notes
      const { data: { user } } = await supabase.auth.getUser();
      const { error: insertError } = await supabase
        .from('meeting_notes')
        .insert({
          user_id: user?.id,
          transcript_text: transcribeResult.text,
          language: transcribeResult.language || 'pt',
          summary: processResult.summary || '',
          sentiment: processResult.sentiment || 'neutral',
          sentiment_score: processResult.sentiment_score,
          action_items: processResult.action_items,
          topics: processResult.topics,
          opportunities: processResult.opportunities,
          risks: processResult.risks,
          intents: processResult.intents,
          customer_name: processResult.customer,
          customer_company: processResult.customer_company,
          participants: processResult.participants,
          sales_rep_name: profile?.name || 'Utilizador',
          meeting_datetime: new Date().toISOString(),
          raw_llm_output: processResult,
          transcript_url: recording.storage_path,
        });

      if (insertError) throw insertError;

      // Remove from failed recordings
      await supabase
        .from('failed_audio_recordings')
        .delete()
        .eq('id', recording.id);

      setRecordings(prev => prev.filter(r => r.id !== recording.id));
      
      toast({
        title: "Sucesso",
        description: "Gravação processada com sucesso!",
      });

      // Navigate to the new meeting
      navigate('/my-meetings');
    } catch (error: unknown) {
      console.error('Error retrying recording:', error);
      
      // Update retry count
      await supabase
        .from('failed_audio_recordings')
        .update({ 
          retry_count: recording.retry_count + 1,
          error_message: error instanceof Error ? error.message : 'Erro desconhecido',
          recording_type: type,
        })
        .eq('id', recording.id);

      await loadRecordings();

      toast({
        title: "Erro no Processamento",
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <AdminLayout title="Gravações Pendentes">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Gravações Pendentes">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Gravações Pendentes
            </h1>
            <p className="text-muted-foreground">
              Áudios que falharam no processamento e podem ser reprocessados
            </p>
          </div>
        </div>

        {recordings.length === 0 ? (
          <Card className="p-12 text-center">
            <FileAudio className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Sem Gravações Pendentes</h3>
            <p className="text-muted-foreground">
              Não existem gravações falhadas para reprocessar.
            </p>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ficheiro</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Erro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordings.map((recording) => (
                  <TableRow key={recording.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileAudio className="w-4 h-4 text-muted-foreground" />
                        <span className="truncate max-w-[200px]">
                          {recording.original_filename || recording.storage_path.split('/').pop()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={recording.recording_type === 'meeting' ? 'default' : 'secondary'}>
                        {recording.recording_type === 'meeting' ? 'Reunião' : 'Nota de Voz'}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatSize(recording.file_size)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {recording.retry_count}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(recording.created_at), "dd MMM yyyy HH:mm", { locale: pt })}
                    </TableCell>
                    <TableCell>
                      {recording.error_message && (
                        <div className="flex items-center gap-1 text-destructive text-sm max-w-[200px] truncate" title={recording.error_message}>
                          <AlertCircle className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{recording.error_message}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedType(recording.recording_type as 'meeting' | 'voice_note');
                            setRetryDialog({ open: true, recording });
                          }}
                          disabled={processingId === recording.id}
                        >
                          {processingId === recording.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                          <span className="ml-2 hidden sm:inline">Reprocessar</span>
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleteDialog({ open: true, id: recording.id })}
                          disabled={processingId === recording.id}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Delete Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, id: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Gravação</DialogTitle>
            <DialogDescription>
              Tem a certeza que deseja eliminar esta gravação? Esta ação não pode ser revertida.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, id: null })}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => deleteDialog.id && handleDelete(deleteDialog.id)}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retry Dialog */}
      <Dialog open={retryDialog.open} onOpenChange={(open) => setRetryDialog({ open, recording: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprocessar Gravação</DialogTitle>
            <DialogDescription>
              Escolha o tipo de processamento para esta gravação.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">Tipo de Processamento</label>
            <Select value={selectedType} onValueChange={(v) => setSelectedType(v as 'meeting' | 'voice_note')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="meeting">
                  Nota de Reunião (com identificação de oradores - Deepgram)
                </SelectItem>
                <SelectItem value="voice_note">
                  Nota de Voz (resumo simples - OpenAI)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetryDialog({ open: false, recording: null })}>
              Cancelar
            </Button>
            <Button onClick={() => retryDialog.recording && handleRetry(retryDialog.recording, selectedType)}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Reprocessar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}