import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, Key, UserX, UserCheck, Building2, Plus, Crown, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import AdminLayout from "@/components/admin/AdminLayout";
import { useAuth } from "@/hooks/useAuth";

interface Department {
  id: string;
  name: string;
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
  active: boolean;
  created_at: string;
  department_id: string | null;
  department?: Department;
  role?: 'admin' | 'sales_rep' | null;
}

const UserManagement = () => {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "", department_id: "", role: "sales_rep" as "admin" | "sales_rep" });
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordErrors, setResetPasswordErrors] = useState<string[]>([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<{ id: string; name: string; email: string; department_id: string | null } | null>(null);
  const [newDeptDialogOpen, setNewDeptDialogOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();
  const { handleSignOut } = useAuth();

  const SUPER_ADMIN_EMAIL = "mnunes.maciel@gmail.com";

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

    // Check if super admin
    const isSuperAdminUser = session.user.email === SUPER_ADMIN_EMAIL;
    setIsSuperAdmin(isSuperAdminUser);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      toast({
        title: "Acesso Negado",
        description: "Apenas administradores podem gerir utilizadores.",
        variant: "destructive",
      });
      navigate("/");
      return;
    }

    setIsAdmin(true);
    await Promise.all([loadUsers(), loadDepartments()]);
    setLoading(false);
  };

  const loadUsers = async () => {
    // Load profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (profilesError) {
      toast({
        title: "Erro",
        description: "Erro ao carregar utilizadores",
        variant: "destructive",
      });
      return;
    }

    // Load departments for mapping
    const { data: depts } = await supabase.from("departments").select("id, name");
    const deptMap = new Map(depts?.map(d => [d.id, d]) || []);

    // Load roles
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);

    const usersWithDepts = (profiles || []).map(p => ({
      ...p,
      department: p.department_id ? deptMap.get(p.department_id) : undefined,
      role: roleMap.get(p.id) || null,
    }));

    setUsers(usersWithDepts);
  };

  const loadDepartments = async () => {
    const { data, error } = await supabase
      .from("departments")
      .select("id, name")
      .order("name");

    if (!error && data) {
      setDepartments(data);
    }
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

  const handleCreateDepartment = async () => {
    if (!newDeptName.trim()) {
      toast({
        title: "Erro",
        description: "O nome do departamento é obrigatório",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Utilizador não autenticado");

      const { data, error } = await supabase
        .from("departments")
        .insert({ user_id: user.id, name: newDeptName.trim() })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: `Departamento "${newDeptName}" criado com sucesso`,
      });

      setNewDeptName("");
      setNewDeptDialogOpen(false);
      await loadDepartments();
      
      // Select the new department
      if (data) {
        setNewUser({ ...newUser, department_id: data.id });
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao criar departamento",
        variant: "destructive",
      });
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
          body: JSON.stringify({
            email: newUser.email,
            password: newUser.password,
            name: newUser.name,
            department_id: newUser.department_id || null,
            role: newUser.role,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao criar utilizador");
      }

      toast({
        title: "Sucesso",
        description: "Utilizador criado com sucesso",
      });

      setNewUser({ email: "", password: "", name: "", department_id: "", role: "sales_rep" });
      setPasswordErrors([]);
      await loadUsers();
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
        throw new Error("Erro ao repor password");
      }

      toast({
        title: "Sucesso",
        description: "Password reposta com sucesso",
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
        throw new Error("Erro ao alterar estado");
      }

      toast({
        title: "Sucesso",
        description: currentActive ? "Utilizador desativado" : "Utilizador ativado",
      });

      await loadUsers();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (rep: UserProfile) => {
    setEditUser({ 
      id: rep.id, 
      name: rep.name, 
      email: rep.email,
      department_id: rep.department_id
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
          department_id: editUser.department_id
        })
        .eq("id", editUser.id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Utilizador atualizado corretamente",
      });

      setEditDialogOpen(false);
      setEditUser(null);
      await loadUsers();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar utilizador",
        variant: "destructive",
      });
    }
  };

  const getRoleBadge = (userProfile: UserProfile) => {
    if (userProfile.email === SUPER_ADMIN_EMAIL) {
      return <Badge className="bg-amber-500 hover:bg-amber-600"><Crown className="w-3 h-3 mr-1" />Super Admin</Badge>;
    }
    if (userProfile.role === 'admin') {
      return <Badge variant="default"><Shield className="w-3 h-3 mr-1" />Admin</Badge>;
    }
    return <Badge variant="secondary">Utilizador</Badge>;
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
    <AdminLayout title="Gestão de Utilizadores">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        {/* Criar novo utilizador */}
        <Dialog>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto" size="sm">
              <UserPlus className="w-4 h-4 mr-2" />
              Criar Novo Utilizador
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Criar Novo Utilizador</DialogTitle>
              <DialogDescription>Preencha os dados do novo utilizador</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome Completo</Label>
                <Input
                  id="name"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="Nome do utilizador"
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
                  placeholder="email@exemplo.pt"
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
                  placeholder="Mínimo 12 caracteres"
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
              
              <div className="space-y-2">
                <Label htmlFor="department">Departamento</Label>
                <div className="flex gap-2">
                <Select 
                  value={newUser.department_id || "__none__"} 
                  onValueChange={(value) => setNewUser({ ...newUser, department_id: value === "__none__" ? "" : value })}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecione um departamento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem departamento</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Dialog open={newDeptDialogOpen} onOpenChange={setNewDeptDialogOpen}>
                    <DialogTrigger asChild>
                      <Button type="button" variant="outline" size="icon">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Criar Departamento</DialogTitle>
                        <DialogDescription>Crie um novo departamento para organizar utilizadores</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Nome do Departamento</Label>
                          <Input 
                            value={newDeptName} 
                            onChange={(e) => setNewDeptName(e.target.value)}
                            placeholder="Ex: Comerciais, Técnicos, Mecânicos..."
                          />
                        </div>
                        <Button onClick={handleCreateDepartment} className="w-full">
                          Criar Departamento
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {isSuperAdmin && (
                <div className="space-y-2">
                  <Label htmlFor="role">Tipo de Utilizador</Label>
                  <Select 
                    value={newUser.role} 
                    onValueChange={(value: "admin" | "sales_rep") => setNewUser({ ...newUser, role: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales_rep">Utilizador</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Administradores podem criar e gerir outros utilizadores
                  </p>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isCreating || passwordErrors.length > 0}>
                {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar Utilizador
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Utilizador</DialogTitle>
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
                <Label htmlFor="editDepartment">Departamento</Label>
                <Select 
                  value={editUser?.department_id || "__none__"} 
                  onValueChange={(value) => setEditUser(editUser ? { ...editUser, department_id: value === "__none__" ? null : value } : null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem departamento</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <DialogTitle>Repor Password</DialogTitle>
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
                Repor Password
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Lista de utilizadores */}
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-lg sm:text-xl font-bold">Utilizadores ({users.length})</h2>
          {users.map((rep) => (
            <Card key={rep.id} className={`p-3 sm:p-4 ${!rep.active ? "opacity-50" : ""}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-sm sm:text-base">{rep.name}</p>
                    {getRoleBadge(rep)}
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground">{rep.email}</p>
                  {rep.department && (
                    <div className="flex items-center gap-1 mt-1">
                      <Building2 className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{rep.department.name}</span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Criado em {new Date(rep.created_at).toLocaleDateString('pt-PT')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditDialog(rep)}
                    className="text-xs sm:text-sm"
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openResetDialog(rep.id)}
                    className="text-xs sm:text-sm"
                  >
                    <Key className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                    Password
                  </Button>
                  {rep.email !== SUPER_ADMIN_EMAIL && (
                    <Button
                      size="sm"
                      variant={rep.active ? "destructive" : "default"}
                      onClick={() => handleToggleActive(rep.id, rep.active)}
                      className="text-xs sm:text-sm"
                    >
                      {rep.active ? (
                        <>
                          <UserX className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                          Desativar
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                          Ativar
                        </>
                      )}
                    </Button>
                  )}
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
