import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, X, Mic2, FileText, BarChart3, Building2, Settings as SettingsIcon, LogOut, Users, Home, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSelector } from "@/components/LanguageSelector";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";

interface MobileNavProps {
  isAdmin?: boolean;
  userEmail?: string;
  accessType?: 'full' | 'renewals_only';
}

export const MobileNav = ({ isAdmin = false, userEmail, accessType = 'full' }: MobileNavProps) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { handleSignOut: authSignOut } = useAuth();

  const handleSignOut = async () => {
    setOpen(false);
    await authSignOut();
  };

  const navigateTo = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] sm:w-[320px]">
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">{t('navigation.menu')}</h2>
            <div className="flex gap-2">
              <ThemeToggle />
              <LanguageSelector />
            </div>
          </div>

          {userEmail && (
            <>
              <div className="text-sm text-muted-foreground mb-4 truncate">
                {userEmail}
              </div>
              <Separator className="mb-4" />
            </>
          )}

          <nav className="flex flex-col gap-2 flex-1">
            {accessType === 'renewals_only' ? (
              <>
                {/* Only Renewals and Settings for renewals_only users */}
                <Button
                  variant="ghost"
                  className="justify-start gap-3"
                  onClick={() => navigateTo("/renewals")}
                >
                  <FileText className="h-4 w-4" />
                  Renovações
                </Button>

                <Button
                  variant="ghost"
                  className="justify-start gap-3"
                  onClick={() => navigateTo("/settings")}
                >
                  <SettingsIcon className="h-4 w-4" />
                  {t('navigation.settings')}
                </Button>
              </>
            ) : (
              <>
                {/* Full access menu */}
                <Button
                  variant="ghost"
                  className="justify-start gap-3"
                  onClick={() => navigateTo("/")}
                >
                  <Mic2 className="h-4 w-4" />
                  {t('navigation.recordNote')}
                </Button>

                <Button
                  variant="ghost"
                  className="justify-start gap-3"
                  onClick={() => navigateTo("/my-meetings")}
                >
                  <FileText className="h-4 w-4" />
                  {t('navigation.myMeetings')}
                </Button>

                <Button
                  variant="ghost"
                  className="justify-start gap-3"
                  onClick={() => navigateTo("/tasks")}
                >
                  <ListTodo className="h-4 w-4" />
                  Tarefas
                </Button>

                <Button
                  variant="ghost"
                  className="justify-start gap-3"
                  onClick={() => navigateTo("/email-analytics")}
                >
                  <BarChart3 className="h-4 w-4" />
                  {t('navigation.analytics')}
                </Button>

                <Button
                  variant="ghost"
                  className="justify-start gap-3"
                  onClick={() => navigateTo("/departments")}
                >
                  <Building2 className="h-4 w-4" />
                  {t('navigation.departments')}
                </Button>

                <Button
                  variant="ghost"
                  className="justify-start gap-3"
                  onClick={() => navigateTo("/settings")}
                >
                  <SettingsIcon className="h-4 w-4" />
                  {t('navigation.settings')}
                </Button>
              </>
            )}

            {isAdmin && (
              <>
                <Separator className="my-2" />
                <div className="text-xs font-semibold text-muted-foreground px-2 mb-2">
                  {t('navigation.administration')}
                </div>

                <Button
                  variant="ghost"
                  className="justify-start gap-3"
                  onClick={() => navigateTo("/dashboard")}
                >
                  <Home className="h-4 w-4" />
                  {t('navigation.dashboard')}
                </Button>

                <Button
                  variant="ghost"
                  className="justify-start gap-3"
                  onClick={() => navigateTo("/admin")}
                >
                  <FileText className="h-4 w-4" />
                  {t('navigation.allMeetings')}
                </Button>

                <Button
                  variant="ghost"
                  className="justify-start gap-3"
                  onClick={() => navigateTo("/admin/users")}
                >
                  <Users className="h-4 w-4" />
                  {t('navigation.manageUsers')}
                </Button>
              </>
            )}
          </nav>

          <div className="mt-auto pt-4 border-t border-border">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-destructive hover:text-destructive"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" />
              {t('navigation.signOut')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
