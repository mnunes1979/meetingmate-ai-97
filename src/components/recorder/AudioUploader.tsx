import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileAudio, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface AudioUploaderProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  className?: string;
}

const ACCEPTED_MIME_TYPES = [
  'audio/webm',
  'audio/wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
];

const ACCEPTED_EXTENSIONS = '.webm,.wav,.mp3,.mpeg,.ogg,.m4a,.mp4';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export const AudioUploader = ({ onFileSelected, disabled, className }: AudioUploaderProps) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { t } = useTranslation();

  const validateFile = useCallback((file: File): boolean => {
    // Check MIME type
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      toast({
        title: t('upload.invalidFormat', 'Formato inválido'),
        description: t('upload.acceptedFormats', 'Formatos aceites: MP3, WAV, WEBM, OGG, M4A'),
        variant: "destructive",
      });
      return false;
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: t('upload.fileTooLarge', 'Ficheiro demasiado grande'),
        description: t('upload.maxSize', 'Tamanho máximo: 100MB'),
        variant: "destructive",
      });
      return false;
    }

    if (file.size < 1000) {
      toast({
        title: t('upload.fileTooSmall', 'Ficheiro demasiado pequeno'),
        description: t('upload.minDuration', 'O ficheiro parece estar vazio ou corrompido'),
        variant: "destructive",
      });
      return false;
    }

    return true;
  }, [toast, t]);

  const handleFile = useCallback((file: File) => {
    if (validateFile(file)) {
      setSelectedFile(file);
    }
  }, [validateFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [disabled, handleFile]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleProcessFile = () => {
    if (selectedFile) {
      onFileSelected(selectedFile);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
          isDragOver && !disabled
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onClick={!disabled ? handleBrowseClick : undefined}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileInputChange}
          className="hidden"
          disabled={disabled}
        />

        {selectedFile ? (
          <div className="space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <FileAudio className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm truncate max-w-[200px] mx-auto">
                {selectedFile.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center">
              <Upload className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {t('upload.dragDrop', 'Arraste um ficheiro de áudio')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('upload.orBrowse', 'ou clique para procurar')}
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground">
              MP3, WAV, WEBM, OGG, M4A (máx. 100MB)
            </p>
          </div>
        )}
      </div>

      {/* Actions when file is selected */}
      {selectedFile && (
        <div className="flex gap-2 justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearFile}
            disabled={disabled}
          >
            <X className="w-4 h-4 mr-1" />
            {t('common.cancel', 'Cancelar')}
          </Button>
          <Button
            size="sm"
            onClick={handleProcessFile}
            disabled={disabled}
          >
            <Upload className="w-4 h-4 mr-1" />
            {t('upload.process', 'Processar')}
          </Button>
        </div>
      )}
    </div>
  );
};
