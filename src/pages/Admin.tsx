import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Building2, User as UserIcon, Calendar } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";

interface MeetingNote {
  id: string;
  created_at: string;
  sales_rep_name: string | null;
  language: string;
  sentiment: string;
  summary: string;
  customer_name: string | null;
  customer_company: string | null;
  meeting_datetime: string | null;
}

const Admin = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<MeetingNote[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        navigate("/auth");
        return;
      }

      setUser(session.user);

      // Check if user is admin
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (roleError) {
        console.error("Error checking admin role:", roleError);
      }

      if (!roleData) {
        toast({
          title: "Accés Denegat",
          description: "No teniu permisos d'administrador",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      setIsAdmin(true);
      loadNotes();
    } catch (error: any) {
      console.error("Auth error:", error);
      navigate("/auth");
    } finally {
      setLoading(false);
    }
  };

  const loadNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('meeting_notes')
        .select('id, created_at, sales_rep_name, language, sentiment, summary, customer_name, customer_company, meeting_datetime')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotes(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Error al carregar les notes",
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

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return 'bg-sentiment-positive/10 text-sentiment-positive border-sentiment-positive/20';
      case 'neutral':
        return 'bg-sentiment-neutral/10 text-sentiment-neutral border-sentiment-neutral/20';
      case 'negative':
        return 'bg-sentiment-negative/10 text-sentiment-negative border-sentiment-negative/20';
      default:
        return 'bg-muted text-muted-foreground';
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
    <AdminLayout title="Backoffice">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-semibold">
            Notes de Reunions ({notes.length})
          </h2>
          <Button onClick={loadNotes} variant="outline" size="sm">
            Actualitzar
          </Button>
        </div>

        <div className="grid gap-3 sm:gap-4">
          {notes.length === 0 ? (
            <Card className="p-6 sm:p-8 text-center">
              <p className="text-sm sm:text-base text-muted-foreground">
                Encara no hi ha notes de reunió
              </p>
            </Card>
          ) : (
            notes.map((note) => (
              <Card key={note.id} className="p-4 sm:p-6 card-gradient border-border/50 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/admin/meeting/${note.id}`)}>
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex items-start justify-between gap-3 sm:gap-4">
                    <div className="flex-1 space-y-1.5 sm:space-y-2">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        {note.sales_rep_name && (
                          <Badge variant="outline" className="gap-1.5">
                            <UserIcon className="w-3 h-3" />
                            {note.sales_rep_name}
                          </Badge>
                        )}
                        <Badge variant="outline" className={getSentimentColor(note.sentiment)}>
                          {note.sentiment}
                        </Badge>
                        <Badge variant="outline">
                          {note.language.toUpperCase()}
                        </Badge>
                      </div>

                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {new Date(note.created_at).toLocaleString('ca-ES', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>
                  </div>

                  {(note.customer_name || note.customer_company) && (
                    <div className="flex gap-3 sm:gap-4 flex-wrap">
                      {note.customer_name && (
                        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                          <UserIcon className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground" />
                          <span>{note.customer_name}</span>
                        </div>
                      )}
                      {note.customer_company && (
                        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                          <Building2 className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground" />
                          <span>{note.customer_company}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {note.meeting_datetime && (
                    <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
                      <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span>
                        {new Date(note.meeting_datetime).toLocaleString('ca-ES', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>
                  )}

                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <p className="text-sm sm:text-base text-foreground/90 line-clamp-3">{note.summary}</p>
                  </div>

                  <Button variant="outline" size="sm" className="w-full mt-2 text-xs sm:text-sm">
                    Ver Análise Completa
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default Admin;
