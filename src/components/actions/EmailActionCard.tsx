import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Mail, Send, FileText, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EmailDraft {
  audience: 'client' | 'finance' | 'tech' | 'sales' | 'support' | 'custom' | 'management';
  subject: string;
  body_md: string;
  suggested_recipients?: string[];
  context?: string;
}

interface EmailActionCardProps {
  draft: EmailDraft;
  onCreateDraft: (recipients: string[]) => void;
  onSend: (recipients: string[]) => void;
}

export const EmailActionCard = ({ draft, onCreateDraft, onSend }: EmailActionCardProps) => {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; emails: string[] }>>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);

  useEffect(() => {
    loadDepartments();
    loadAllowedDomains();
    
    // Auto-populate if audience matches department name
    if (draft.suggested_recipients && draft.suggested_recipients.length > 0) {
      setRecipients(draft.suggested_recipients);
    }
  }, [draft]);

  const loadAllowedDomains = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("allowed_email_domains")
        .eq("id", user.id)
        .single();

      setAllowedDomains(Array.isArray(profile?.allowed_email_domains) ? profile.allowed_email_domains as string[] : []);
    } catch (error) {
      console.error("Error loading allowed domains:", error);
    }
  };

  const loadDepartments = async () => {
    try {
      const { data: depts, error } = await supabase
        .from("departments")
        .select("*")
        .order("name");

      if (error) throw error;

      const deptsWithEmails = await Promise.all(
        (depts || []).map(async (dept) => {
          const { data: emails } = await supabase
            .from("department_emails")
            .select("email")
            .eq("department_id", dept.id);

          return {
            id: dept.id,
            name: dept.name,
            emails: emails?.map((e) => e.email) || [],
          };
        })
      );

      setDepartments(deptsWithEmails);
    } catch (error) {
      console.error("Error loading departments:", error);
    }
  };

  // Auto-select department matching audience name if recipients are empty
  useEffect(() => {
    if (departments.length === 0 || recipients.length > 0) return;

    const audienceAliases: Record<string, string[]> = {
      sales: ['comercial', 'vendes', 'ventas', 'sales'],
      finance: ['finance', 'finanças', 'finançes', 'financeiro', 'financiero'],
      tech: ['tècnic', 'técnico', 'tecnico', 'tech', 'tecnologia'],
      management: ['direcció', 'dirección', 'direction', 'diretoria', 'management'],
      support: ['suport', 'suporte', 'soporte', 'support'],
      custom: [],
    };

    const aliases = audienceAliases[draft.audience] || [];
    const match = departments.find((d) =>
      [draft.audience, ...aliases].some((alias) =>
        d.name.toLowerCase().includes(alias.toLowerCase())
      )
    );

    if (match && match.emails.length > 0) {
      setSelectedDeptId(match.id);
      const merged = Array.from(new Set([...recipients, ...match.emails.map((e) => e.toLowerCase())]));
      setRecipients(merged);
    }
  }, [departments, draft.audience]);

  const handleDepartmentSelect = (deptId: string) => {
    setSelectedDeptId(deptId);
    const dept = departments.find((d) => d.id === deptId);
    if (dept && dept.emails.length > 0) {
      // Add department emails to recipients, avoiding duplicates
      const newRecipients = [...recipients];
      dept.emails.forEach((email) => {
        if (!newRecipients.includes(email)) {
          newRecipients.push(email);
        }
      });
      setRecipients(newRecipients);
    }
  };

  const getAudienceColor = () => {
    switch (draft.audience) {
      case 'client':
        return 'bg-action-email/10 text-action-email border-action-email/20';
      case 'finance':
        return 'bg-sentiment-positive/10 text-sentiment-positive border-sentiment-positive/20';
      case 'tech':
        return 'bg-action-trello/10 text-action-trello border-action-trello/20';
      case 'sales':
        return 'bg-primary/10 text-primary border-primary/20';
      case 'support':
        return 'bg-action-calendar/10 text-action-calendar border-action-calendar/20';
      case 'management':
        return 'bg-sentiment-neutral/10 text-sentiment-neutral border-sentiment-neutral/20';
      case 'custom':
        return 'bg-secondary/10 text-secondary-foreground border-secondary/20';
      default:
        return 'bg-muted/10 text-muted-foreground border-muted/20';
    }
  };

  const addRecipient = (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (trimmed && !recipients.includes(trimmed) && trimmed.includes('@')) {
      setRecipients([...recipients, trimmed]);
      setRecipientInput("");
    }
  };

  const isEmailAllowed = (email: string): boolean => {
    if (allowedDomains.length === 0) return true;
    
    const domain = email.split('@')[1]?.toLowerCase();
    return allowedDomains.some(allowed => 
      domain === allowed.toLowerCase() || domain?.endsWith(`.${allowed.toLowerCase()}`)
    );
  };

  const restrictedRecipients = recipients.filter(email => !isEmailAllowed(email));

  const removeRecipient = (email: string) => {
    setRecipients(recipients.filter(r => r !== email));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addRecipient(recipientInput);
    }
  };

  return (
    <Card className="p-6 space-y-4 card-gradient border-border/50">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-action-email/10">
            <Mail className="w-5 h-5 text-action-email" />
          </div>
          <div>
            <h3 className="font-semibold">Esborrany de Correu</h3>
            <Badge variant="outline" className={`mt-1 ${getAudienceColor()}`}>
              {draft.audience.charAt(0).toUpperCase() + draft.audience.slice(1)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">Assumpte</p>
          <p className="font-medium">{draft.subject}</p>
        </div>

        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">Cos</p>
          <div className="p-4 rounded-lg bg-background/50 border border-border/50">
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
              {draft.body_md}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Destinataris</p>
          
          {departments.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                Selecciona un Departament
              </Label>
              <Select value={selectedDeptId} onValueChange={handleDepartmentSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona departament..." />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name} ({dept.emails.length} email{dept.emails.length !== 1 ? 's' : ''})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-2">
            {recipients.map((email) => (
              <Badge 
                key={email} 
                variant={isEmailAllowed(email) ? "secondary" : "destructive"} 
                className="gap-1.5 pr-1"
              >
                {email}
                <button
                  onClick={() => removeRecipient(email)}
                  className="ml-1 hover:bg-background/50 rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          
          {restrictedRecipients.length > 0 && (
            <div className="p-3 rounded-lg bg-sentiment-negative/10 border border-sentiment-negative/20">
              <p className="text-xs text-sentiment-negative font-medium">
                ⚠️ {restrictedRecipients.length} destinatari(s) no permès(os) segons la configuració de dominis. Configureu dominis permesos a Configuració.
              </p>
            </div>
          )}
          <Input
            placeholder="Introduïu adreces de correu electrònic (premeu Enter per afegir)"
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => recipientInput && addRecipient(recipientInput)}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          onClick={() => onCreateDraft(recipients)}
          disabled={recipients.length === 0 || restrictedRecipients.length > 0}
          className="gap-2"
        >
          <FileText className="w-4 h-4" />
          Crear Esborrany
        </Button>
        <Button
          onClick={() => onSend(recipients)}
          disabled={recipients.length === 0 || restrictedRecipients.length > 0}
          className="gap-2"
        >
          <Send className="w-4 h-4" />
          Enviar Ara
        </Button>
      </div>
    </Card>
  );
};
