import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VoiceRecorder } from "@/components/recorder/VoiceRecorder";
import { ProcessingSteps } from "@/components/meeting/ProcessingSteps";
import { SummaryCard } from "@/components/meeting/SummaryCard";
import { EntitiesCard } from "@/components/meeting/EntitiesCard";
import { EmailActionCard } from "@/components/actions/EmailActionCard";
import { SalesOpportunitiesCard } from "@/components/meeting/SalesOpportunitiesCard";
import { BusinessInsightsCard } from "@/components/meeting/BusinessInsightsCard";
import { useToast } from "@/hooks/use-toast";
import { Mic2, LogIn, Building2, FileText, BarChart3, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MobileNav } from "@/components/MobileNav";
import { LanguageSelector } from "@/components/LanguageSelector";
import { ThemeToggle } from "@/components/ThemeToggle";
import { retryWithBackoff, parseEdgeFunctionError, TimeoutError, RateLimitError, PaymentRequiredError } from "@/lib/retry";

interface ProcessedMeeting {
  language: string;
  summary: {
    overview: string;
    topics_discussed: string[];
    key_points: string[];
    strengths: string[];
    weaknesses: string[];
    action_items: string[];
  };
  sentiment: 'positive' | 'neutral' | 'negative';
  sentiment_confidence?: number;
  customer?: { name?: string; company?: string };
  participants: Array<{ name: string; role?: string }>;
  meeting?: { datetime_iso?: string; duration_min?: number };
  intents: any[];
  email_drafts: Array<{ audience: 'client' | 'finance' | 'tech' | 'sales' | 'support' | 'management' | 'custom'; subject: string; body_md: string; suggested_recipients?: string[]; context?: string }>;
  risks: any[];
  sales_opportunities?: Array<{
    title: string;
    description: string;
    product_service: string;
    estimated_value: "low" | "medium" | "high";
    urgency: "low" | "medium" | "high";
    probability: "low" | "medium" | "high";
    trigger: string;
    recommended_action: string;
  }>;
  client_needs?: Array<{
    need: string;
    importance: "low" | "medium" | "high";
    solution: string;
  }>;
  objections?: Array<{
    objection: string;
    type: "price" | "timing" | "technical" | "trust" | "other";
    severity: "low" | "medium" | "high";
    response: string;
  }>;
  business_insights?: {
    overall_interest: "low" | "medium" | "high";
    decision_stage: "awareness" | "consideration" | "decision" | "closed";
    budget_indicators: string;
    timeline_indicators: string;
    competition_mentions: string;
    key_influencers: string;
  };
}

const Index = () => {
  const { t } = useTranslation();
  const [salesRepName, setSalesRepName] = useState("");
  const [processingStep, setProcessingStep] = useState<'upload' | 'transcribe' | 'process' | 'complete' | null>(null);
  const [processedMeeting, setProcessedMeeting] = useState<ProcessedMeeting | null>(null);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Check auth status and load user profile
  useEffect(() => {
    const loadAuthAndProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
      
      if (session?.user) {
        // Load user profile to get name and access_type
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, email, access_type')
          .eq('id', session.user.id)
          .single();
        
        if (profile) {
          if (profile.name) {
            setSalesRepName(profile.name);
          }
          setUserProfile(profile);
          
          // Redirect renewals_only users to renewals page
          if (profile.access_type === 'renewals_only' && window.location.pathname === '/') {
            navigate('/renewals');
          }
        }
        
        // Check if user is admin
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "admin")
          .maybeSingle();
        
        setIsAdmin(!!roleData);
      }
    };

    loadAuthAndProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setIsAuthenticated(!!session);
      
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, email, access_type')
          .eq('id', session.user.id)
          .single();
        
        if (profile) {
          if (profile.name) {
            setSalesRepName(profile.name);
          }
          setUserProfile(profile);
        }
        
        // Check if user is admin
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "admin")
          .maybeSingle();
        
        setIsAdmin(!!roleData);
      }
    });

    return () => subscription.unsubscribe();
  }, []);


  const handleRecordingComplete = async (audioBlob: Blob) => {
    console.log('[handleRecordingComplete] START - audioBlob size:', audioBlob.size, 'type:', audioBlob.type);
    try {
      setProcessingStep('upload');
      console.log('[handleRecordingComplete] Processing step set to upload');

      // Get current user for secure file storage
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
      console.log('[handleRecordingComplete] Session check:', { 
        hasSession: !!currentSession, 
        hasUser: !!currentSession?.user, 
        error: sessionError 
      });
      
      if (!currentSession?.user) {
        throw new Error('User must be authenticated to upload recordings');
      }

      // Capture actual recording date/time from device
      const recordingDateTime = new Date().toISOString();

      // Upload audio to storage - sanitize filename and include user ID for RLS
      const sanitizedName = salesRepName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-zA-Z0-9]/g, '-')   // Replace special chars with hyphen
        .replace(/-+/g, '-')             // Replace multiple hyphens with single
        .replace(/^-|-$/g, '');          // Remove leading/trailing hyphens
      const fileName = `${Date.now()}-${sanitizedName}.webm`;
      const filePath = `${currentSession.user.id}/${fileName}`;
      
      // Upload audio directly (no retry to prevent hanging)
      console.log('[Upload] starting upload to storage', { filePath });
      const { error: uploadError } = await supabase.storage
        .from('audio-recordings')
        .upload(filePath, audioBlob, {
          contentType: 'audio/webm',
          upsert: false,
        });

      if (uploadError) {
        console.error('[Upload] failed:', uploadError);
        throw uploadError;
      }
      console.log('[Upload] success');

      const { data: { publicUrl } } = supabase.storage
        .from('audio-recordings')
        .getPublicUrl(filePath);

      setProcessingStep('transcribe');

      // Validate audio size
      console.log('[Validation] Audio blob size:', audioBlob.size, 'bytes');
      if (audioBlob.size < 1000) {
        throw new Error(t('errors.audioTooShort', 'Áudio demasiado curto ou corrompido. Por favor, grave pelo menos 3 segundos de áudio com voz clara.'));
      }

      // Get mime type from blob
      const mimeType = audioBlob.type || 'audio/webm';
      console.log('[Transcribe] Audio mime type:', mimeType);

      // Ensure authenticated and get access token
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error(t('errors.authRequired', 'Autenticação necessária para transcrever. Inicie sessão.'));
      }

      // Call transcription function with storage path (no base64 encoding needed!)
      console.log('[Transcribe] Calling edge function with storage path:', filePath);
      const transcriptData = await retryWithBackoff(
        async (signal) => {
          const { data, error } = await supabase.functions.invoke('transcribe-audio', {
            headers: { Authorization: `Bearer ${accessToken}` },
            body: { storagePath: filePath, mime: mimeType },
          });

          if (error) {
            // Parse error to determine if it's retryable
            const parsedError = parseEdgeFunctionError(error);
            
            if (parsedError.status === 429) {
              throw new RateLimitError(parsedError.message);
            } else if (parsedError.status === 402) {
              throw new PaymentRequiredError(parsedError.message);
            } else {
              throw new Error(parsedError.message);
            }
          }

          if (!data?.text || data.text.trim().length === 0) {
            throw new Error(t('errors.noVoiceDetected', 'Não foi detetada nenhuma voz no áudio. Por favor, certifique-se de falar claramente durante a gravação.'));
          }

          console.log('[Transcription] Success, text length:', data.text.length);
          return data;
        },
        {
          maxAttempts: 3,
          initialDelayMs: 2000,
          timeoutMs: 90000, // 90 seconds
          onRetry: (attempt, error) => {
            console.log(`Transcription retry attempt ${attempt}:`, error.message);
            toast({
              title: t('common.loading'),
              description: t('retry.transcribing', { attempt }),
            });
          },
        }
      );

      setProcessingStep('process');

        // Call LLM processing function with retry and timeout
        const processData = await retryWithBackoff(
          async (signal) => {
            const { data, error } = await supabase.functions.invoke('process-meeting', {
              headers: { Authorization: `Bearer ${accessToken}` },
              body: {
                transcript: transcriptData.text,
                language: transcriptData.language,
                recordingDateTime: recordingDateTime,
              },
            });

            if (error) {
              // Parse error to determine if it's retryable
              const parsedError = parseEdgeFunctionError(error);
              
              if (parsedError.status === 429) {
                throw new RateLimitError(parsedError.message);
              } else if (parsedError.status === 402) {
                throw new PaymentRequiredError(parsedError.message);
              } else {
                throw new Error(parsedError.message);
              }
            }

            if (!data) {
              throw new Error(t('errors.processingFailed', 'Não foi possível processar a reunião. Tente novamente.'));
            }

            return data;
          },
          {
            maxAttempts: 3,
            initialDelayMs: 2000,
            timeoutMs: 90000, // 90 seconds
            onRetry: (attempt, error) => {
              console.log(`Processing retry attempt ${attempt}:`, error.message);
              toast({
                title: t('common.loading'),
                description: t('retry.processing', { attempt }),
              });
            },
          }
        );

        setProcessingStep('complete');

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error(t('errors.authRequiredSave', 'Autenticação necessária para guardar a reunião'));
        }

        // Save to database
        const { data: noteData, error: noteError } = await supabase
          .from('meeting_notes')
          .insert({
            user_id: user.id,
            sales_rep_name: salesRepName,
            language: processData.language,
            sentiment: processData.sentiment,
            sentiment_confidence: processData.sentiment_confidence,
            transcript_url: publicUrl,
            transcript_text: transcriptData.text,
            summary: typeof processData.summary === 'string' 
              ? processData.summary 
              : JSON.stringify(processData.summary),
            customer_name: processData.customer?.name,
            customer_company: processData.customer?.company,
            meeting_datetime: recordingDateTime,
            meeting_duration_min: processData.meeting?.duration_min,
            participants: processData.participants,
            intents: processData.intents,
            risks: processData.risks,
            raw_llm_output: processData,
          })
          .select()
          .single();

        if (noteError) throw noteError;

        setCurrentNoteId(noteData.id);
        setProcessedMeeting(processData);

        toast({
          title: t('retry.success'),
          description: t('retry.successDesc'),
        });

        setTimeout(() => setProcessingStep(null), 2000);

    } catch (error: any) {
      console.error("[handleRecordingComplete] ERROR:", error);
      console.error("[handleRecordingComplete] Error stack:", error?.stack);
      console.error("[handleRecordingComplete] Error details:", {
        name: error?.name,
        message: error?.message,
        code: error?.code,
        status: error?.status
      });
      
      // Show specific error messages based on error type
      let title = t('errors.processingError', 'Erro de Processamento');
      let description = error.message || t('errors.processingErrorDesc', 'Ocorreu um erro durante o processamento');
      
      if (error instanceof TimeoutError) {
        title = t('errors.timeout', 'Tempo Esgotado');
        description = t('errors.timeoutDesc', 'A operação demorou demasiado. Por favor, tente gravar um áudio mais curto ou tente novamente.');
      } else if (error instanceof RateLimitError) {
        title = t('errors.rateLimit', 'Limite Excedido');
        description = t('errors.rateLimitDesc', 'Foi excedido o limite de pedidos. Por favor, aguarde alguns minutos antes de tentar novamente.');
      } else if (error instanceof PaymentRequiredError) {
        title = t('errors.creditsExhausted', 'Créditos Esgotados');
        description = t('errors.creditsExhaustedDesc', 'Os créditos da sua conta esgotaram-se. Por favor, adicione créditos para continuar.');
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
      setProcessingStep(null);
    }
  };

  const handleCreateEmailDraft = async (draft: any, recipients: string[]) => {
    if (!currentNoteId) return;

    try {
      // Normalize audience value to English
      const normalizeAudience = (audience: string): string => {
        const audienceMap: Record<string, string> = {
          'client': 'client',
          'finance': 'finance',
          'tech': 'tech',
          'sales': 'sales',
          'support': 'support',
          'management': 'management',
          'custom': 'custom',
          'internal': 'internal',
          // Catalan variants
          'intern': 'internal',
          'finançes': 'finance',
          'tècnic': 'tech',
          'vendes': 'sales',
          'suport': 'support',
          'direcció': 'management',
          'personalitzat': 'custom',
        };
        return audienceMap[audience.toLowerCase()] || 'custom';
      };

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Autenticação necessária');
      }

      // Replace name placeholders in email body
      const processedBody = draft.body_md
        .replace(/\[El teu nom\]/gi, salesRepName || '[El teu nom]')
        .replace(/\[Tu nombre\]/gi, salesRepName || '[Tu nombre]')
        .replace(/\[Seu nome\]/gi, salesRepName || '[Seu nome]')
        .replace(/\[Your name\]/gi, salesRepName || '[Your name]')
        .replace(/\[Votre nom\]/gi, salesRepName || '[Votre nom]')
        .replace(/\[Ton nom\]/gi, salesRepName || '[Ton nom]');

      const { error } = await supabase.from('email_actions').insert({
        user_id: user.id,
        note_id: currentNoteId,
        audience: normalizeAudience(draft.audience),
        subject: draft.subject,
        body_md: processedBody,
        recipients,
        status: 'draft',
      } as any);

      if (error) throw error;

      toast({
        title: t('email.draftSaved'),
        description: t('email.draftSavedDesc'),
      });
    } catch (error: any) {
      console.error('Error creating email draft:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSendEmail = async (draft: any, recipients: string[]) => {
    if (!currentNoteId || recipients.length === 0) return;

    try {
      // Normalize audience value
      const normalizeAudience = (audience: string): string => {
        const audienceMap: Record<string, string> = {
          'client': 'client',
          'finance': 'finance',
          'tech': 'tech',
          'sales': 'sales',
          'support': 'support',
          'management': 'management',
          'custom': 'custom',
          'internal': 'internal',
          'intern': 'internal',
          'finançes': 'finance',
          'tècnic': 'tech',
          'vendes': 'sales',
          'suport': 'support',
          'direcció': 'management',
          'personalitzat': 'custom',
        };
        return audienceMap[audience.toLowerCase()] || 'custom';
      };

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Autenticação necessária');
      }

      // Replace name placeholders in email body
      const processedBody = draft.body_md
        .replace(/\[El teu nom\]/gi, salesRepName || '[El teu nom]')
        .replace(/\[Tu nombre\]/gi, salesRepName || '[Tu nombre]')
        .replace(/\[Seu nome\]/gi, salesRepName || '[Seu nome]')
        .replace(/\[Your name\]/gi, salesRepName || '[Your name]')
        .replace(/\[Votre nom\]/gi, salesRepName || '[Votre nom]')
        .replace(/\[Ton nom\]/gi, salesRepName || '[Ton nom]');

      // Update status to sending
      await supabase.from('email_actions').insert({
        user_id: user.id,
        note_id: currentNoteId,
        audience: normalizeAudience(draft.audience),
        subject: draft.subject,
        body_md: processedBody,
        recipients,
        status: 'sending',
      } as any);

      // Send email
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          recipients,
          subject: draft.subject,
          body: processedBody,
          fromName: salesRepName,
          note_id: currentNoteId,
        },
      });

      if (error) throw error;

      if (data?.success) {
      toast({
        title: t('email.sent'),
        description: t('email.sentSuccess', { recipients: recipients.join(', ') }),
      });

        // Update status to sent
        await supabase
          .from('email_actions')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('note_id', currentNoteId)
          .eq('subject', draft.subject);
      } else {
        throw new Error(data?.error || 'Error desconegut');
      }
    } catch (error: any) {
      console.error('Error sending email:', error);
      
      // Check if it's a Resend domain validation error
      const isDomainError = error.message?.includes('verify a domain') || error.message?.includes('validation_error');
      
      toast({
        title: t('email.sendError'),
        description: isDomainError 
          ? t('email.domainError')
          : error.message || t('email.error'),
        variant: "destructive",
      });

      // Update status to error
      if (currentNoteId) {
        await supabase
          .from('email_actions')
          .update({ 
            status: 'error',
            error_message: error.message 
          })
          .eq('note_id', currentNoteId)
          .eq('subject', draft.subject);
      }
    }
  };

  const handleUpdateEntities = async (updates: {
    customerName?: string;
    customerCompany?: string;
    participants?: Array<{ name: string; role?: string }>;
  }) => {
    if (!currentNoteId || !processedMeeting) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Autenticação necessária');
      }

      // Update database
      const { error: updateError } = await supabase
        .from('meeting_notes')
        .update({
          customer_name: updates.customerName,
          customer_company: updates.customerCompany,
          participants: updates.participants,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentNoteId)
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      // Update local state with name replacements throughout
      const oldCustomerName = processedMeeting.customer?.name || '';
      const oldCompanyName = processedMeeting.customer?.company || '';
      const newCustomerName = updates.customerName || '';
      const newCompanyName = updates.customerCompany || '';

      // Function to replace names in text
      const replaceNames = (text: string): string => {
        let result = text;
        if (oldCustomerName && newCustomerName && oldCustomerName !== newCustomerName) {
          result = result.replace(new RegExp(oldCustomerName, 'gi'), newCustomerName);
        }
        if (oldCompanyName && newCompanyName && oldCompanyName !== newCompanyName) {
          result = result.replace(new RegExp(oldCompanyName, 'gi'), newCompanyName);
        }
        return result;
      };

      // Update processedMeeting with replaced names everywhere
      const updatedMeeting = {
        ...processedMeeting,
        customer: {
          ...processedMeeting.customer,
          name: updates.customerName,
          company: updates.customerCompany,
        },
        participants: updates.participants || [],
        // Update email drafts with replaced names
        email_drafts: processedMeeting.email_drafts?.map(draft => ({
          ...draft,
          subject: replaceNames(draft.subject),
          body_md: replaceNames(draft.body_md),
        })),
        // Update sales opportunities with replaced names
        sales_opportunities: processedMeeting.sales_opportunities?.map(opp => ({
          ...opp,
          title: replaceNames(opp.title),
          description: replaceNames(opp.description),
          product_service: replaceNames(opp.product_service),
          trigger: replaceNames(opp.trigger),
          recommended_action: replaceNames(opp.recommended_action),
        })),
        // Update client needs with replaced names
        client_needs: processedMeeting.client_needs?.map(need => ({
          ...need,
          need: replaceNames(need.need),
          solution: replaceNames(need.solution),
        })),
        // Update objections with replaced names
        objections: processedMeeting.objections?.map(obj => ({
          ...obj,
          objection: replaceNames(obj.objection),
          response: replaceNames(obj.response),
        })),
        // Update business insights with replaced names
        business_insights: processedMeeting.business_insights ? {
          ...processedMeeting.business_insights,
          budget_indicators: replaceNames(processedMeeting.business_insights.budget_indicators),
          timeline_indicators: replaceNames(processedMeeting.business_insights.timeline_indicators),
          competition_mentions: replaceNames(processedMeeting.business_insights.competition_mentions),
          key_influencers: replaceNames(processedMeeting.business_insights.key_influencers),
        } : undefined,
        // Update summary with replaced names
        summary: typeof processedMeeting.summary === 'object' ? {
          ...processedMeeting.summary,
          overview: replaceNames(processedMeeting.summary.overview),
          topics_discussed: processedMeeting.summary.topics_discussed?.map(replaceNames),
          key_points: processedMeeting.summary.key_points?.map(replaceNames),
        } : replaceNames(processedMeeting.summary),
      };

      setProcessedMeeting(updatedMeeting as ProcessedMeeting);

      toast({
        title: "Actualitzat",
        description: "Els canvis s'han guardat i aplicat a tot el document.",
      });
    } catch (error: any) {
      console.error('Error updating entities:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Redirect to auth if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-md space-y-6 sm:space-y-8">
          <div className="text-center space-y-3 sm:space-y-4">
            <div className="flex justify-center mb-4">
              <div className="p-3 sm:p-4 rounded-2xl bg-primary/10">
                <Mic2 className="w-10 h-10 sm:w-12 sm:h-12 text-primary" />
              </div>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">AfterMeeting</h1>
            <p className="text-base sm:text-lg text-muted-foreground px-4">
              Assistente de notas de reunião com inteligência artificial
            </p>
          </div>

          <div className="space-y-4 px-4">
            <Button size="lg" className="w-full" onClick={() => navigate("/auth")}>
              <LogIn className="w-4 h-4 mr-2" />
              Iniciar Sessão
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-10 bg-background/80">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <MobileNav isAdmin={isAdmin} userEmail={userProfile?.email} accessType={userProfile?.access_type} />
              <div className="p-1.5 sm:p-2 rounded-xl bg-primary/10">
                <Mic2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-base sm:text-xl font-bold">AfterMeeting</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">{salesRepName}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              {isAuthenticated && (
                <>
                  {/* Show different menu options based on access_type */}
                  {userProfile?.access_type === 'renewals_only' ? (
                    <>
                      {/* Only Renewals and Settings for renewals_only users */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("/renewals")}
                        className="gap-2 hidden md:flex"
                      >
                        <FileText className="w-4 h-4" />
                        Renovações
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("/settings")}
                        className="gap-2 hidden md:flex"
                      >
                        <Settings className="w-4 h-4" />
                        {t('navigation.settings')}
                      </Button>
                    </>
                  ) : (
                    <>
                      {/* Full access menu */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("/my-meetings")}
                        className="gap-2 hidden md:flex"
                      >
                        <FileText className="w-4 h-4" />
                        {t('home.myMeetings')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("/email-analytics")}
                        className="gap-2 hidden lg:flex"
                      >
                        <BarChart3 className="w-4 h-4" />
                        Analytics
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("/settings")}
                        className="gap-2 hidden md:flex"
                      >
                        <Settings className="w-4 h-4" />
                        {t('navigation.settings')}
                      </Button>
                    </>
                  )}
                  {isAdmin && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("/admin/dashboard")}
                        className="gap-2 hidden lg:flex"
                      >
                        Dashboard
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("/admin")}
                        className="gap-2 hidden lg:flex"
                      >
                        Admin
                      </Button>
                    </>
                  )}
                  <div className="hidden sm:flex items-center gap-2">
                    <ThemeToggle />
                    <LanguageSelector />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      // Force redirect even if signOut fails
                      try {
                        await supabase.auth.signOut();
                      } catch (error) {
                        console.error('SignOut error:', error);
                      } finally {
                        // Always clear state and redirect
                        setIsAuthenticated(false);
                        setUserProfile(null);
                        setProcessedMeeting(null);
                        setCurrentNoteId(null);
                        window.location.href = '/auth';
                      }
                    }}
                    className="gap-2 hidden sm:flex text-xs sm:text-sm"
                  >
                    <LogIn className="w-3 h-3 sm:w-4 sm:h-4" />
                    Sair
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-4xl">
        <div className="space-y-6">
          <VoiceRecorder
            onRecordingComplete={handleRecordingComplete}
            isProcessing={!!processingStep}
          />

          {processingStep && <ProcessingSteps currentStep={processingStep} />}

          {processedMeeting && !processingStep && (
            <>
              <SummaryCard
                summary={processedMeeting.summary}
                sentiment={processedMeeting.sentiment}
                language={processedMeeting.language}
                confidence={processedMeeting.sentiment_confidence}
              />

              <EntitiesCard
                customerName={processedMeeting.customer?.name}
                customerCompany={processedMeeting.customer?.company}
                participants={processedMeeting.participants}
                meetingDatetime={processedMeeting.meeting?.datetime_iso}
                meetingDuration={processedMeeting.meeting?.duration_min}
                onUpdate={handleUpdateEntities}
              />

              {processedMeeting.email_drafts && processedMeeting.email_drafts.map((draft, index) => (
                <EmailActionCard
                  key={`email-${index}`}
                  draft={draft}
                  onCreateDraft={(recipients) => handleCreateEmailDraft(draft, recipients)}
                  onSend={(recipients) => handleSendEmail(draft, recipients)}
                />
              ))}

              {processedMeeting.sales_opportunities && processedMeeting.sales_opportunities.length > 0 && (
                <SalesOpportunitiesCard opportunities={processedMeeting.sales_opportunities} />
              )}

              <BusinessInsightsCard
                clientNeeds={processedMeeting.client_needs}
                objections={processedMeeting.objections}
                businessInsights={processedMeeting.business_insights}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
