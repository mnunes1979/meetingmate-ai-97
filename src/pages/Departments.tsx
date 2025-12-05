import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Mail, Building2 } from "lucide-react";
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
}

const Departments = () => {
  const { t } = useTranslation();
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
      
      // Check access_type
      const { data: profile } = await supabase
        .from('profiles')
        .select('access_type')
        .eq('id', session.user.id)
        .single();
      
      if (profile?.access_type === 'renewals_only') {
        toast({
          title: "Acesso Restrito",
          description: "Você só tem permissão para acessar a área de Renovações",
          variant: "destructive",
        });
        navigate("/renewals");
        return;
      }

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

      const deptsWithEmails = await Promise.all(
        (depts || []).map(async (dept) => {
          const { data: emails } = await supabase
            .from("department_emails")
            .select("email")
            .eq("department_id", dept.id);

          return {
            ...dept,
            emails: emails?.map((e) => e.email) || [],
          };
        })
      );

      setDepartments(deptsWithEmails);
    } catch (error: any) {
      console.error("Error loading departments:", error);
      toast({
        title: "Error",
        description: error.message || "Error en carregar departaments",
        variant: "destructive",
      });
    }
  };

  const handleCreateDepartment = async () => {
    if (!newDeptName.trim()) {
      toast({
        title: "Error",
        description: "El nom del departament és obligatori",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No authenticated user");

      const { error } = await supabase.from("departments").insert({
        user_id: user.id,
        name: newDeptName.trim(),
      });

      if (error) throw error;

      toast({
        title: "Departament creat",
        description: `El departament "${newDeptName}" s'ha creat correctament.`,
      });

      setNewDeptName("");
      setIsCreateDialogOpen(false);
      await loadDepartments();
    } catch (error: any) {
      console.error("Error creating department:", error);
      toast({
        title: "Error",
        description: error.message || "Error en crear departament",
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
        title: "Departament eliminat",
        description: "El departament s'ha eliminat correctament.",
      });

      await loadDepartments();
    } catch (error: any) {
      console.error("Error deleting department:", error);
      toast({
        title: "Error",
        description: error.message || "Error en eliminar departament",
        variant: "destructive",
      });
    }
  };

  const handleAddEmail = async () => {
    if (!newEmail.trim() || !selectedDeptId) {
      toast({
        title: "Error",
        description: "Correu electrònic no vàlid",
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
        title: "Email afegit",
        description: `L'email ${newEmail} s'ha afegit correctament.`,
      });

      setNewEmail("");
      setIsAddEmailDialogOpen(false);
      await loadDepartments();
    } catch (error: any) {
      console.error("Error adding email:", error);
      toast({
        title: "Error",
        description: error.message || "Error en afegir correu electrònic",
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
        title: "Email eliminat",
        description: "L'email s'ha eliminat correctament.",
      });

      await loadDepartments();
    } catch (error: any) {
      console.error("Error removing email:", error);
      toast({
        title: "Error",
        description: error.message || "Error en eliminar correu electrònic",
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
        title: "Error",
        description: "El nom del departament és obligatori",
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
        title: "Departament actualitzat",
        description: "El departament s'ha actualitzat correctament.",
      });

      setIsEditDialogOpen(false);
      setEditDept(null);
      await loadDepartments();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Error en actualitzar departament",
        variant: "destructive",
      });
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('SignOut error:', error);
    } finally {
      window.location.href = '/auth';
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
    <AdminLayout title="Departaments">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-3">
          <div>
            <h2 className="text-2xl font-bold">Departaments</h2>
            <p className="text-muted-foreground">Gestiona els departaments i els seus emails</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Nou Departament
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Nou Departament</DialogTitle>
                <DialogDescription>Introdueix el nom del nou departament</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="dept-name">Nom del Departament</Label>
                  <Input
                    id="dept-name"
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    placeholder="Ex: Vendes, Finançes, Suport..."
                  />
                </div>
                <Button onClick={handleCreateDepartment} className="w-full">
                  Crear Departament
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit Department Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Departament</DialogTitle>
              <DialogDescription>Modifica el nom del departament</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-dept-name">Nom del Departament</Label>
                <Input
                  id="edit-dept-name"
                  value={editDept?.name || ""}
                  onChange={(e) => setEditDept(editDept ? { ...editDept, name: e.target.value } : null)}
                />
              </div>
              <Button onClick={handleUpdateDepartment} className="w-full">
                Guardar Canvis
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="space-y-4">
          {departments.length === 0 ? (
            <Card className="p-8 text-center">
              <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Encara no tens cap departament creat</p>
            </Card>
          ) : (
            departments.map((dept) => (
              <Card key={dept.id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">{dept.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {dept.emails.length} email(s) configurat(s)
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
                          Afegir Email
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Afegir Email a {dept.name}</DialogTitle>
                          <DialogDescription>
                            Introdueix l'adreça de correu electrònic
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
                              placeholder="exemple@empresa.com"
                            />
                          </div>
                          <Button onClick={handleAddEmail} className="w-full">
                            Afegir
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

                {dept.emails.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Emails:</p>
                    <div className="flex flex-wrap gap-2">
                      {dept.emails.map((email) => (
                        <Badge key={email} variant="secondary" className="gap-2">
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
