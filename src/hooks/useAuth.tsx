import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useAuth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignOut = async () => {
    try {
      // First, clear all local state
      localStorage.clear();
      sessionStorage.clear();
      
      // Then sign out from Supabase
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('SignOut error:', error);
        // Even if signOut fails, still redirect
      }
      
      // Force navigation to auth page
      navigate('/auth', { replace: true });
      
      // Optional: Show success message
      toast({
        title: "Sessão terminada",
        description: "Você foi desconectado com sucesso",
      });
      
    } catch (error) {
      console.error('Unexpected error during signOut:', error);
      
      // Force redirect even on error
      navigate('/auth', { replace: true });
      
      toast({
        title: "Erro ao sair",
        description: "Ocorreu um erro, mas você foi desconectado",
        variant: "destructive",
      });
    }
  };

  return { handleSignOut };
};
