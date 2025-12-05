import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Mail, Building2, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Department {
  id: string;
  name: string;
  created_at: string;
  emails: string[];
  members: { id: string; name: string; email: string }[];
}

const Departments = () => {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newDeptName, setNewDeptName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isAddEmailDialogOpen, setIsAddEmailDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editDept, setEditDept] = useState<{ id: string; name: string } | null>(null);
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

      setUser(session.user);

      // Check if user is admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .single();

      setIsAdmin(!!roleData);
      await loadDepartments();
    } catch (error) {
      console.error("Error checking auth:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const { data: depts, error: deptsError } = await supabase
        .from("departments")
        .select("*")
        .order("name");

      if (deptsError) throw deptsError;

      const deptsWithDetails = await Promise.all(
        (depts || []).map(async (dept) => {
          // Get emails
          const { data: emails } = await supabase
            .from("department_emails")
            .select("email")
            .eq("department_id", dept.id);

          // Get members (users in this department)
          const { data: members } = await supabase
            .from("profiles")
            .select("id, name, email")
            .eq("department_id", dept.id);

          return {
            ...dept,
            emails: emails?.map((e) => e.email) || [],
            members: members || [],
          };
        })
      );

      setDepartments(deptsWithDetails);
    } catch (error: any) {
      console.error("Error loading departments:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao carregar departamentos",
        variant: "destructive",
      });
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

      const { error } = await supabase.from("departments").insert({
        user_id: user.id,
        name: newDeptName.trim(),
      });

      if (error) throw error;

      toast({
        title: "Departamento criado",
        description: `O departamento "${newDeptName}" foi criado com sucesso.`,
      });

      setNewDeptName("");
      setIsCreateDialogOpen(false);
      await loadDepartments();
    } catch (error: any) {
      console.error("Error creating department:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao criar departamento",
        variant: "destructive",
      });
    }
  };

  const handleDeleteDepartment = async (deptId: string) => {
    try {
      const { error } = await supabase
        .from("departments")
        .delete()
        .eq("id", deptId);

      if (error) throw error;

      toast({
        title: "Departamento eliminado",
        description: "O departamento foi eliminado com sucesso.",
      });

      await loadDepartments();
    } catch (error: any) {
      console.error("Error deleting department:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao eliminar departamento",
        variant: "destructive",
      });
    }
  };

  const handleAddEmail = async () => {
    if (!newEmail.trim() || !selectedDeptId) {
      toast({
        title: "Erro",
        description: "Email inválido",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.from("department_emails").insert({
        department_id: selectedDeptId,
        email: newEmail.trim().toLowerCase(),
      });

      if (error) throw error;

      toast({
        title: "Email adicionado",
        description: `O email ${newEmail} foi adicionado com sucesso.`,
      });

      setNewEmail("");
      setIsAddEmailDialogOpen(false);
      await loadDepartments();
    } catch (error: any) {
      console.error("Error adding email:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao adicionar email",
        variant: "destructive",
      });
    }
  };

  const handleRemoveEmail = async (deptId: string, email: string) => {
    try {
      const { error } = await supabase
        .from("department_emails")
        .delete()
        .eq("department_id", deptId)
        .eq("email", email);

      if (error) throw error;

      toast({
        title: "Email removido",
        description: "O email foi removido com sucesso.",
      });

      await loadDepartments();
    } catch (error: any) {
      console.error("Error removing email:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao remover email",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (dept: Department) => {
    setEditDept({ id: dept.id, name: dept.name });
    setIsEditDialogOpen(true);
  };

  const handleUpdateDepartment = async () => {
    if (!editDept || !editDept.name.trim()) {
      toast({
        title: "Erro",
        description: "O nome do departamento é obrigatório",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("departments")
        .update({ name: editDept.name.trim() })
        .eq("id", editDept.id);

      if (error) throw error;

      toast({
        title: "Departamento atualizado",
        description: "O departamento foi atualizado com sucesso.",
      });

      setIsEditDialogOpen(false);
      setEditDept(null);
      await loadDepartments();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar departamento",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AdminLayout title="Departamentos">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-3">
          <div>
            <h2 className="text-2xl font-bold">Departamentos</h2>
            <p className="text-muted-foreground">Gerencie os departamentos e os seus membros</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Novo Departamento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Novo Departamento</DialogTitle>
                <DialogDescription>Introduza o nome do novo departamento</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="dept-name">Nome do Departamento</Label>
                  <Input
                    id="dept-name"
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

        {/* Edit Department Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Departamento</DialogTitle>
              <DialogDescription>Modifique o nome do departamento</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-dept-name">Nome do Departamento</Label>
                <Input
                  id="edit-dept-name"
                  value={editDept?.name || ""}
                  onChange={(e) => setEditDept(editDept ? { ...editDept, name: e.target.value } : null)}
                />
              </div>
              <Button onClick={handleUpdateDepartment} className="w-full">
                Guardar Alterações
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="space-y-4">
          {departments.length === 0 ? (
            <Card className="p-8 text-center">
              <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Ainda não tem departamentos criados</p>
            </Card>
          ) : (
            departments.map((dept) => (
              <Card key={dept.id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">{dept.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {dept.members.length} membro(s) • {dept.emails.length} email(s) de contacto
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditDialog(dept)}
                    >
                      Editar
                    </Button>
                    <Dialog
                      open={isAddEmailDialogOpen && selectedDeptId === dept.id}
                      onOpenChange={(open) => {
                        setIsAddEmailDialogOpen(open);
                        if (open) setSelectedDeptId(dept.id);
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          <Mail className="w-4 h-4 mr-2" />
                          Adicionar Email
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Adicionar Email a {dept.name}</DialogTitle>
                          <DialogDescription>
                            Introduza o endereço de email do responsável
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="new-email">Email</Label>
                            <Input
                              id="new-email"
                              type="email"
                              value={newEmail}
                              onChange={(e) => setNewEmail(e.target.value)}
                              placeholder="exemplo@empresa.pt"
                            />
                          </div>
                          <Button onClick={handleAddEmail} className="w-full">
                            Adicionar
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteDepartment(dept.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Members */}
                {dept.members.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Membros:</p>
                    <div className="flex flex-wrap gap-2">
                      {dept.members.map((member) => (
                        <Badge key={member.id} variant="secondary" className="gap-1">
                          <User className="w-3 h-3" />
                          {member.name || member.email}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contact Emails */}
                {dept.emails.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Emails de Contacto:</p>
                    <div className="flex flex-wrap gap-2">
                      {dept.emails.map((email) => (
                        <Badge key={email} variant="outline" className="gap-2">
                          <Mail className="w-3 h-3" />
                          {email}
                          <button
                            onClick={() => handleRemoveEmail(dept.id, email)}
                            className="hover:text-destructive"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default Departments;
