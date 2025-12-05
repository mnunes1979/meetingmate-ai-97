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
import { Loader2, Mail, Copy, Check, Sparkles, Send, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newRecipient, setNewRecipient] = useState("");
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
    const mailtoLink = `mailto:${recipients.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`;
    window.open(mailtoLink, '_blank');
  };

  const handleAddRecipient = () => {
    const email = newRecipient.trim().toLowerCase();
    if (!email) return;
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: "Email inválido",
        description: "Por favor, introduza um endereço de email válido",
        variant: "destructive",
      });
      return;
    }

    if (recipients.includes(email)) {
      toast({
        title: "Email duplicado",
        description: "Este endereço já foi adicionado",
        variant: "destructive",
      });
      return;
    }

    setRecipients([...recipients, email]);
    setNewRecipient("");
  };

  const handleRemoveRecipient = (email: string) => {
    setRecipients(recipients.filter(r => r !== email));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddRecipient();
    }
  };

  const handleSendEmail = async () => {
    if (recipients.length === 0) {
      toast({
        title: "Sem destinatários",
        description: "Adicione pelo menos um destinatário para enviar o email",
        variant: "destructive",
      });
      return;
    }

    if (!subject.trim() || !body.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha o assunto e o corpo do email",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
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

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          recipients,
          subject,
          body,
          note_id: meetingId,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Email enviado!",
          description: `Email enviado com sucesso para ${recipients.length} destinatário(s)`,
        });
        
        // Reset and close
        setRecipients([]);
        setSubject("");
        setBody("");
        setGenerated(false);
        onOpenChange(false);
      } else {
        throw new Error(data.error || "Erro ao enviar email");
      }
    } catch (error: any) {
      console.error("Error sending email:", error);
      toast({
        title: "Erro ao enviar",
        description: error.message || "Não foi possível enviar o email",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
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
                  Gerar Rascunho
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Recipients */}
            <div className="space-y-2">
              <Label>Destinatários</Label>
              <div className="flex gap-2">
                <Input
                  value={newRecipient}
                  onChange={(e) => setNewRecipient(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="email@exemplo.com"
                  type="email"
                  className="flex-1"
                />
                <Button onClick={handleAddRecipient} type="button" variant="outline" size="icon">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {recipients.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {recipients.map((email) => (
                    <Badge key={email} variant="secondary" className="flex items-center gap-1 py-1">
                      {email}
                      <button
                        onClick={() => handleRemoveRecipient(email)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

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
                className="min-h-[250px] font-mono text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-4 border-t">
              <Button 
                onClick={handleSendEmail} 
                disabled={sending || recipients.length === 0}
                className="bg-primary"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    A enviar...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Enviar Email
                  </>
                )}
              </Button>
              <Button onClick={handleCopy} variant="outline">
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copiar
                  </>
                )}
              </Button>
              <Button onClick={handleOpenMailClient} variant="outline">
                <Mail className="w-4 h-4 mr-2" />
                Cliente de Email
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