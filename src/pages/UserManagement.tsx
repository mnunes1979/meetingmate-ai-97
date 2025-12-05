import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, Key, UserX, UserCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminLayout from "@/components/admin/AdminLayout";
import { useAuth } from "@/hooks/useAuth";

interface SalesRep {
  id: string;
  email: string;
  name: string;
  active: boolean;
  created_at: string;
  access_type?: 'full' | 'renewals_only';
}

const UserManagement = () => {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "" });
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordErrors, setResetPasswordErrors] = useState<string[]>([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<{ id: string; name: string; email: string; access_type: 'full' | 'renewals_only' } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { handleSignOut } = useAuth();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      navigate("/auth");
      return;
    }

    setUser(session.user);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      toast({
        title: "Acesso Negado",
        description: "Apenas administradores podem gerir comerciais.",
        variant: "destructive",
      });
      navigate("/");
      return;
    }

    setIsAdmin(true);
    await loadSalesReps();
    setLoading(false);
  };

  const loadSalesReps = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Erro",
        description: "Erro ao carregar comerciais",
        variant: "destructive",
      });
      return;
    }

    setSalesReps(data || []);
  };

  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];
    
    if (password.length < 12) {
      errors.push("Mínimo 12 caracteres");
    }
    if (!/[A-Z]/.test(password)) {
      errors.push("Deve conter pelo menos uma letra maiúscula");
    }
    if (!/[a-z]/.test(password)) {
      errors.push("Deve conter pelo menos uma letra minúscula");
    }
    if (!/[0-9]/.test(password)) {
      errors.push("Deve conter pelo menos um número");
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      errors.push("Deve conter pelo menos um carácter especial");
    }
    
    return errors;
  };

  const handlePasswordChange = (password: string, isReset = false) => {
    const errors = validatePassword(password);
    if (isReset) {
      setResetPassword(password);
      setResetPasswordErrors(errors);
    } else {
      setNewUser({ ...newUser, password });
      setPasswordErrors(errors);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const errors = validatePassword(newUser.password);
    if (errors.length > 0) {
      setPasswordErrors(errors);
      toast({
        title: "Password Inválida",
        description: "Por favor, corrija os erros de password.",
        variant: "destructive",
      });
      return;
    }
    
    setIsCreating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify(newUser),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error en crear l'usuari");
      }

      toast({
        title: "Èxit",
        description: "Comercial creat amb èxit",
      });

      setNewUser({ email: "", password: "", name: "" });
      setPasswordErrors([]);
      await loadSalesReps();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleResetPassword = async () => {
    const errors = validatePassword(resetPassword);
    if (errors.length > 0) {
      setResetPasswordErrors(errors);
      toast({
        title: "Password Inválida",
        description: "Por favor, corrija os erros de password.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ userId: resetUserId, newPassword: resetPassword }),
        }
      );

      if (!response.ok) {
        throw new Error("Erro ao resetar password");
      }

      toast({
        title: "Sucesso",
        description: "Password resetada com sucesso",
      });
      
      setResetDialogOpen(false);
      setResetPassword("");
      setResetPasswordErrors([]);
      setResetUserId("");
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openResetDialog = (userId: string) => {
    setResetUserId(userId);
    setResetPassword("");
    setResetPasswordErrors([]);
    setResetDialogOpen(true);
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-toggle-user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ userId, active: !currentActive }),
        }
      );

      if (!response.ok) {
        throw new Error("Error en canviar l'estat");
      }

      toast({
        title: "Èxit",
        description: currentActive ? "Comercial desactivat" : "Comercial activat",
      });

      await loadSalesReps();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (rep: SalesRep) => {
    setEditUser({ 
      id: rep.id, 
      name: rep.name, 
      email: rep.email,
      access_type: rep.access_type || 'full'
    });
    setEditDialogOpen(true);
  };

  const handleUpdateUser = async () => {
    if (!editUser) return;

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ 
          name: editUser.name, 
          email: editUser.email,
          access_type: editUser.access_type
        })
        .eq("id", editUser.id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Usuário atualizado corretamente",
      });

      setEditDialogOpen(false);
      setEditUser(null);
      await loadSalesReps();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar usuário",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <AdminLayout title="Gestão de Comerciais">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        {/* Criar novo comercial */}
        <Dialog>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto" size="sm">
              <UserPlus className="w-4 h-4 mr-2" />
              Crear Nou Comercial
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nou Comercial</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom Complet</Label>
                <Input
                  id="name"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={newUser.password}
                  onChange={(e) => handlePasswordChange(e.target.value, false)}
                  required
                  minLength={12}
                />
                {passwordErrors.length > 0 && (
                  <div className="text-sm text-destructive space-y-1">
                    <p className="font-medium">Requisitos de password:</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {passwordErrors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={isCreating || passwordErrors.length > 0}>
                {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Crear Comercial
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Usuari</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editName">Nome</Label>
                <Input
                  id="editName"
                  value={editUser?.name || ""}
                  onChange={(e) => setEditUser(editUser ? { ...editUser, name: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editEmail">Email</Label>
                <Input
                  id="editEmail"
                  type="email"
                  value={editUser?.email || ""}
                  onChange={(e) => setEditUser(editUser ? { ...editUser, email: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accessType">Tipo de Acesso</Label>
                <Select 
                  value={editUser?.access_type || 'full'} 
                  onValueChange={(value: 'full' | 'renewals_only') => 
                    setEditUser(editUser ? { ...editUser, access_type: value } : null)
                  }
                >
                  <SelectTrigger id="accessType">
                    <SelectValue placeholder="Selecione o tipo de acesso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Acesso Completo</SelectItem>
                    <SelectItem value="renewals_only">Apenas Renovações</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {editUser?.access_type === 'renewals_only' 
                    ? 'Este usuário só verá o menu de Renovações' 
                    : 'Este usuário tem acesso a todas as funcionalidades'}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdateUser}>
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resetar Password</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={resetPassword}
                  onChange={(e) => handlePasswordChange(e.target.value, true)}
                  minLength={12}
                  placeholder="Introduza a nova password"
                />
                {resetPasswordErrors.length > 0 && (
                  <div className="text-sm text-destructive space-y-1">
                    <p className="font-medium">Requisitos de password:</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {resetPasswordErrors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleResetPassword} 
                disabled={resetPasswordErrors.length > 0 || !resetPassword}
              >
                Resetar Password
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Lista de comerciais */}
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-lg sm:text-xl font-bold">Comerciais ({salesReps.length})</h2>
          {salesReps.map((rep) => (
            <Card key={rep.id} className={`p-3 sm:p-4 ${!rep.active ? "opacity-50" : ""}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex-1">
                  <p className="font-bold text-sm sm:text-base">{rep.name}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">{rep.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Criado: {new Date(rep.created_at).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Acesso: {rep.access_type === 'renewals_only' ? 'Apenas Renovações' : 'Completo'}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(rep)}
                    className="w-full sm:w-auto text-xs sm:text-sm"
                  >
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openResetDialog(rep.id)}
                    className="w-full sm:w-auto text-xs sm:text-sm"
                  >
                    <Key className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                    Resetar Password
                  </Button>
                  <Button
                    variant={rep.active ? "destructive" : "default"}
                    size="sm"
                    onClick={() => handleToggleActive(rep.id, rep.active)}
                    className="w-full sm:w-auto text-xs sm:text-sm"
                  >
                    {rep.active ? (
                      <>
                        <UserX className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                        Desativar
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                        Ativar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};

export default UserManagement;
