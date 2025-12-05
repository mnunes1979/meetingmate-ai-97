import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
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
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <SidebarInset>
          <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
            <div className="flex items-center justify-between px-3 sm:px-4 py-3">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <h1 className="text-lg md:text-xl font-semibold">{title}</h1>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
                  <Mic2 className="w-4 h-4 mr-2" />
                  Gravar
                </Button>
                <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sair">
                  <LogOut className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </header>

          <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
