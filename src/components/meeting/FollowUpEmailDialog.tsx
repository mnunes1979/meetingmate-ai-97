import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Copy, Check, Sparkles } from "lucide-react";

interface FollowUpEmailDialogProps {
  meetingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const FollowUpEmailDialog = ({
  meetingId,
  open,
  onOpenChange,
}: FollowUpEmailDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);
  const [generated, setGenerated] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Erro",
          description: "Sessão expirada. Faça login novamente.",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('generate-followup-email', {
        body: { meetingId },
      });

      if (error) throw error;

      setSubject(data.subject || "");
      setBody(data.body || "");
      setGenerated(true);

      toast({
        title: "Email gerado",
        description: "O rascunho do email foi criado com sucesso",
      });
    } catch (error: any) {
      console.error("Error generating email:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao gerar email de follow-up",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    const fullEmail = `Assunto: ${subject}\n\n${body}`;
    await navigator.clipboard.writeText(fullEmail);
    setCopied(true);
    toast({
      title: "Copiado!",
      description: "Email copiado para a área de transferência",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenMailClient = () => {
    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`;
    window.open(mailtoLink, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Email de Follow-up
          </DialogTitle>
        </DialogHeader>

        {!generated ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Sparkles className="w-12 h-12 text-primary" />
            <p className="text-center text-muted-foreground">
              A IA irá gerar um email profissional de follow-up baseado na análise da reunião.
            </p>
            <Button onClick={handleGenerate} disabled={loading} size="lg">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  A gerar...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar Email de Follow-up
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Assunto</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Assunto do email..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="body">Corpo do Email</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Conteúdo do email..."
                className="min-h-[300px] font-mono text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-4 border-t">
              <Button onClick={handleCopy} variant="outline">
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copiar Email
                  </>
                )}
              </Button>
              <Button onClick={handleOpenMailClient} variant="outline">
                <Mail className="w-4 h-4 mr-2" />
                Abrir no Cliente de Email
              </Button>
              <Button onClick={handleGenerate} variant="ghost" disabled={loading}>
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Regenerar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
