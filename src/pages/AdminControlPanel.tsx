import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, UserCog, Building2, FileX, RotateCcw, AlertTriangle } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const AdminControlPanel = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      const { data: adminCheck } = await supabase.rpc('has_role', {
        _user_id: session.user.id,
        _role: 'admin'
      });

      if (!adminCheck) {
        navigate("/");
        return;
      }

      setIsAdmin(true);
    } catch (error) {
      console.error("Error checking auth:", error);
      navigate("/auth");
    } finally {
      setLoading(false);
    }
  };

  const executeAction = async (action: string) => {
    setProcessing(true);
    try {
      let result;
      const { data: { session } } = await supabase.auth.getSession();

      switch (action) {
        case 'delete-users':
          result = await supabase.functions.invoke('admin-delete-users', {
            headers: { Authorization: `Bearer ${session?.access_token}` }
          });
          break;
        case 'delete-departments':
          result = await supabase.functions.invoke('admin-delete-departments', {
            headers: { Authorization: `Bearer ${session?.access_token}` }
          });
          break;
        case 'delete-meetings':
          result = await supabase.functions.invoke('admin-delete-meetings', {
            body: { scope: 'global' },
            headers: { Authorization: `Bearer ${session?.access_token}` }
          });
          break;
        case 'factory-reset':
          result = await supabase.functions.invoke('admin-factory-reset', {
            headers: { Authorization: `Bearer ${session?.access_token}` }
          });
          break;
      }

      if (result?.error) {
        throw result.error;
      }

      toast({
        title: "Sucesso",
        description: "Operação concluída com sucesso",
      });
    } catch (error: any) {
      console.error(`Error executing ${action}:`, error);
      toast({
        title: "Erro",
        description: error.message || "Operação falhou",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
      setConfirmAction(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <AdminLayout title="Painel de Controlo Admin">
      <div className="space-y-6">
        <Card className="p-6 bg-destructive/5 border-destructive/20">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-destructive mt-1" />
            <div>
              <h3 className="font-semibold text-destructive mb-2">Zona de Perigo</h3>
              <p className="text-sm text-muted-foreground">
                Estas ações são irreversíveis. Use com extrema cautela. Todas as ações são registadas para auditoria.
              </p>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-start gap-4">
              <Trash2 className="w-8 h-8 text-destructive" />
              <div className="flex-1">
                <h3 className="font-semibold mb-2">Eliminar Todos os Utilizadores</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Eliminar permanentemente todos os utilizadores exceto administradores. Esta ação não pode ser desfeita.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmAction('delete-users')}
                  disabled={processing}
                >
                  Eliminar Utilizadores
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start gap-4">
              <Building2 className="w-8 h-8 text-destructive" />
              <div className="flex-1">
                <h3 className="font-semibold mb-2">Eliminar Todos os Departamentos</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Eliminar permanentemente todos os departamentos e emails associados.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmAction('delete-departments')}
                  disabled={processing}
                >
                  Eliminar Departamentos
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start gap-4">
              <FileX className="w-8 h-8 text-destructive" />
              <div className="flex-1">
                <h3 className="font-semibold mb-2">Eliminar Todas as Reuniões</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Eliminar permanentemente todas as notas de reunião de todo o sistema.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmAction('delete-meetings')}
                  disabled={processing}
                >
                  Eliminar Reuniões
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-2 border-destructive">
            <div className="flex items-start gap-4">
              <RotateCcw className="w-8 h-8 text-destructive" />
              <div className="flex-1">
                <h3 className="font-semibold mb-2 text-destructive">Reset de Fábrica</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Eliminar TODOS os dados: utilizadores (exceto admins), departamentos e reuniões. Esta é a opção nuclear.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmAction('factory-reset')}
                  disabled={processing}
                >
                  Reset de Fábrica
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem a certeza absoluta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isto irá eliminar permanentemente os dados selecionados do sistema.
              {confirmAction === 'factory-reset' && (
                <span className="block mt-2 font-semibold text-destructive">
                  AVISO: Isto irá eliminar TODOS os dados de utilizadores exceto contas de admin!
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && executeAction(confirmAction)}
              disabled={processing}
              className="bg-destructive hover:bg-destructive/90"
            >
              {processing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar Eliminação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminControlPanel;