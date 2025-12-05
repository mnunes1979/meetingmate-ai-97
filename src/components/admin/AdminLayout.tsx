import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBadge } from "@/components/NotificationBadge";
import { Button } from "@/components/ui/button";
import { Mic2, LogOut } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";

interface AdminLayoutProps {
  title: string;
  children: ReactNode;
}

export default function AdminLayout({ title, children }: AdminLayoutProps) {
  const navigate = useNavigate();
  const { handleSignOut } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />

        <SidebarInset className="flex-1">
          {/* Floating Glass Header */}
          <header className="sticky top-0 z-50 floating-header">
            <div className="flex items-center justify-between px-4 sm:px-6 py-4">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="hover:bg-muted/50 rounded-xl transition-colors" />
                <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{title}</h1>
              </div>
              <div className="flex items-center gap-2">
                <NotificationBadge />
                <ThemeToggle />
                <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="hidden sm:flex">
                  <Mic2 className="w-4 h-4 mr-2" />
                  Gravar
                </Button>
                <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sair" className="rounded-xl">
                  <LogOut className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </header>

          {/* Main Content Area */}
          <main className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
