import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic2, Loader2 } from "lucide-react";
import { z } from "zod";

const Auth = () => {
  const { t } = useTranslation();
  
  const authSchema = z.object({
    email: z.string().email({ message: t('auth.invalidEmail', 'Endereço de email inválido') }).max(255),
    password: z.string().min(6, { message: t('auth.passwordMinLength', 'A palavra-passe deve ter pelo menos 6 caracteres') }).max(100),
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        // Check if user is admin
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "admin")
          .single();
        
        if (roleData) {
          navigate("/admin");
        } else {
          navigate("/");
        }
      }
    });

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        // Defer Supabase calls with setTimeout to prevent deadlock
        setTimeout(async () => {
          // Check if user is admin
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .eq("role", "admin")
            .single();
          
          if (roleData) {
            navigate("/admin");
          } else {
            navigate("/");
          }
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validation = authSchema.safeParse({ email, password });
      if (!validation.success) {
        toast({
          title: t('auth.validationError', 'Erro de Validação'),
          description: validation.error.errors[0].message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        toast({
          title: t('auth.loginError', 'Erro de início de sessão'),
          description: error.message,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message || t('auth.unexpectedError', 'Ocorreu um erro inesperado'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 space-y-6 card-gradient border-border/50">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-2xl bg-primary/10">
              <Mic2 className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">AfterMeeting</h1>
          <p className="text-muted-foreground">{t('auth.login', 'Entrar')}</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.email', 'Email')}</Label>
            <Input
              id="email"
              type="email"
              placeholder="oseu@email.pt"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t('auth.password', 'Palavra-passe')}</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('auth.login', 'Entrar')}
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default Auth;
