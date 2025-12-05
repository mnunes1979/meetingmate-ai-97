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
        title: "Success",
        description: "Operation completed successfully",
      });
    } catch (error: any) {
      console.error(`Error executing ${action}:`, error);
      toast({
        title: "Error",
        description: error.message || "Operation failed",
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
    <AdminLayout title="Admin Control Panel">
      <div className="space-y-6">
        <Card className="p-6 bg-destructive/5 border-destructive/20">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-destructive mt-1" />
            <div>
              <h3 className="font-semibold text-destructive mb-2">Danger Zone</h3>
              <p className="text-sm text-muted-foreground">
                These actions are irreversible. Use with extreme caution. All actions are logged for audit purposes.
              </p>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-start gap-4">
              <Trash2 className="w-8 h-8 text-destructive" />
              <div className="flex-1">
                <h3 className="font-semibold mb-2">Delete All Users</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Permanently delete all users except administrators. This cannot be undone.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmAction('delete-users')}
                  disabled={processing}
                >
                  Delete Users
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start gap-4">
              <Building2 className="w-8 h-8 text-destructive" />
              <div className="flex-1">
                <h3 className="font-semibold mb-2">Delete All Departments</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Permanently delete all departments and their associated emails.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmAction('delete-departments')}
                  disabled={processing}
                >
                  Delete Departments
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start gap-4">
              <FileX className="w-8 h-8 text-destructive" />
              <div className="flex-1">
                <h3 className="font-semibold mb-2">Delete All Meetings</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Permanently delete all meeting notes across the entire system.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmAction('delete-meetings')}
                  disabled={processing}
                >
                  Delete Meetings
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-2 border-destructive">
            <div className="flex items-start gap-4">
              <RotateCcw className="w-8 h-8 text-destructive" />
              <div className="flex-1">
                <h3 className="font-semibold mb-2 text-destructive">Factory Reset</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Delete ALL data: users (except admins), departments, and meetings. This is the nuclear option.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmAction('factory-reset')}
                  disabled={processing}
                >
                  Factory Reset
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected data from the system.
              {confirmAction === 'factory-reset' && (
                <span className="block mt-2 font-semibold text-destructive">
                  WARNING: This will delete ALL user data except admin accounts!
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && executeAction(confirmAction)}
              disabled={processing}
              className="bg-destructive hover:bg-destructive/90"
            >
              {processing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminControlPanel;