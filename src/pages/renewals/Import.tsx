import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileText, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import AdminLayout from '@/components/admin/AdminLayout';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Import() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClearAllData = async () => {
    setClearing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // First get all services to delete related renewals
      const { data: services } = await supabase
        .from('services')
        .select('id')
        .eq('user_id', user.id);

      if (services && services.length > 0) {
        const serviceIds = services.map(s => s.id);
        
        // Delete all renewals for these services
        const { error: renewalsError } = await supabase
          .from('renewals')
          .delete()
          .in('service_id', serviceIds);

        if (renewalsError) throw renewalsError;
      }

      // Delete all services
      const { error: servicesError } = await supabase
        .from('services')
        .delete()
        .eq('user_id', user.id);

      if (servicesError) throw servicesError;

      toast.success('✅ Dados limpos com sucesso! Pode agora reimportar o ficheiro corrigido.');
    } catch (error: any) {
      console.error('Error clearing data:', error);
      toast.error(`❌ Erro ao limpar dados: ${error.message}`);
    } finally {
      setClearing(false);
    }
  };

  const extractMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { data, error } = await supabase.functions.invoke('extract-service-data', {
        body: { document_id: documentId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setProcessing(false);
      
      // Show errors if any
      if (data.errors && data.errors.length > 0) {
        toast.warning(`Imported ${data.summary.total} services with ${data.errors.length} errors. Check console for details.`);
        console.error('Import errors:', data.errors);
      } else if (data.summary?.total === 0) {
        toast.error('No services were imported. Please check the document format.');
        return;
      }
      
      // Navigate based on results
      if (data.summary && (data.summary.expired > 0 || data.summary.dueSoon > 0)) {
        toast.success(`Extracted ${data.summary.total} services`);
        navigate('/renewals/critical');
      } else if (data.summary?.total > 0) {
        toast.success('Services imported successfully');
        navigate('/renewals');
      }
    },
    onError: (error: any) => {
      setProcessing(false);
      toast.error(error.message || 'Failed to extract service data');
    },
  });

  const handleFile = async (file: File) => {
    if (!file) return;

    const acceptedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    if (!acceptedTypes.includes(file.type)) {
      toast.error('Invalid file type. Please upload PDF, DOCX, images, or spreadsheets.');
      return;
    }

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error('Not authenticated');

      // Upload to storage - sanitize filename to remove special characters
      const sanitizedFilename = file.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-zA-Z0-9._-]/g, '_'); // Replace special chars with underscore
      const filePath = `${user.id}/${Date.now()}_${sanitizedFilename}`;
      const { error: uploadError } = await supabase.storage
        .from('renewals')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create document record
      const { data: document, error: docError } = await supabase
        .from('documents')
        .insert({
          user_id: user.id,
          filename: file.name,
          mime_type: file.type,
          storage_path: filePath,
          file_size: file.size,
        })
        .select()
        .single();

      if (docError) throw docError;

      setUploading(false);
      setProcessing(true);

      // Start extraction
      toast.info('Processing document...');
      extractMutation.mutate(document.id);

    } catch (error: any) {
      setUploading(false);
      toast.error(error.message || 'Upload failed');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  return (
    <AdminLayout title={t('renewals.importTitle')}>
      <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-muted-foreground">
          {t('renewals.importSubtitle')}
        </p>
        <Button variant="outline" onClick={() => navigate('/renewals')}>
          {t('renewals.back')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Document</CardTitle>
          <CardDescription>
            Supported formats: PDF, DOCX, PNG, JPG, CSV, XLS, XLSX
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="destructive" 
                className="w-full"
                disabled={clearing || uploading || processing}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {clearing ? "A limpar..." : "Limpar Todos os Dados"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>⚠️ Tem a certeza absoluta?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação irá <strong>eliminar PERMANENTEMENTE</strong> todos os serviços e renovações da sua conta. 
                  <br /><br />
                  <strong>Esta ação não pode ser desfeita!</strong>
                  <br /><br />
                  Use este botão apenas antes de reimportar dados corrigidos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleClearAllData}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Sim, eliminar tudo permanentemente
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.png,.jpg,.jpeg,.csv,.xls,.xlsx"
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading || processing}
          />
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !uploading && !processing && fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
              transition-colors
              ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
              ${(uploading || processing) ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-lg font-medium">Uploading...</p>
              </div>
            ) : processing ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-lg font-medium">Processing document...</p>
                <p className="text-sm text-muted-foreground">
                  Extracting service information using AI
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="h-12 w-12 text-muted-foreground" />
                {isDragging ? (
                  <p className="text-lg font-medium">Drop the file here</p>
                ) : (
                  <>
                    <p className="text-lg font-medium">
                      Drag & drop a file here, or click to select
                    </p>
                    <p className="text-sm text-muted-foreground">
                      PDF, DOCX, images, or spreadsheets
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What we extract</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium">Provider & Service Information</p>
              <p className="text-sm text-muted-foreground">
                Service provider name, type (domain, hosting, VPS, etc.), and service name
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium">Renewal Dates</p>
              <p className="text-sm text-muted-foreground">
                Automatically detects dates in various formats (DD/MM/YYYY, YYYY-MM-DD, text dates)
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium">Client Information (Optional)</p>
              <p className="text-sm text-muted-foreground">
                Extracts client name if mentioned in the document
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium">Renewal Cycle</p>
              <p className="text-sm text-muted-foreground">
                Annual, monthly, biennial, or other billing cycles
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </AdminLayout>
  );
}