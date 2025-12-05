import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MobileNav } from "@/components/MobileNav";
import { LanguageSelector } from "@/components/LanguageSelector";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GoogleCalendarSettings } from "@/components/settings/GoogleCalendarSettings";
import { TrelloSettings } from "@/components/settings/TrelloSettings";
import { useAuth } from "@/hooks/useAuth";

const Settings = () => {
  const { t } = useTranslation();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { handleSignOut } = useAuth();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate("/auth");
      return;
    }

    setUser(user);

    // Load profile
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    setProfile(profileData);

    // Check if user is admin
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    setIsAdmin(roles?.some(r => r.role === 'admin') || false);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Check connection status securely without exposing tokens
  const isGoogleConnected = profile?.google_linked;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-10 bg-background/80">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <MobileNav userEmail={user?.email} accessType={profile?.access_type} />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/")}
                className="hidden md:flex"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-lg md:text-xl font-bold">{t('settings.title')}</h1>
                <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">{user?.email}</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <ThemeToggle />
              <LanguageSelector />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
              >
                {t('auth.logout')}
              </Button>
            </div>
            <div className="md:hidden">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-2xl">
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">{t('settings.integrations')}</h2>
            <p className="text-muted-foreground">
              {t('settings.connectServices')}
            </p>
          </div>

          {/* Google Calendar Component */}
          <GoogleCalendarSettings />
          
          {/* Trello Component - Only visible to admins */}
          {isAdmin && <TrelloSettings />}
        </div>
      </main>
    </div>
  );
};

export default Settings;
