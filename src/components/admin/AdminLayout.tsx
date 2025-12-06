import { ReactNode } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBadge } from "@/components/NotificationBadge";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";

interface AdminLayoutProps {
  title: string;
  children: ReactNode;
}

export default function AdminLayout({ title, children }: AdminLayoutProps) {
  const { handleSignOut } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background overflow-x-hidden">
        <AppSidebar />

        <SidebarInset className="flex-1 min-w-0">
          {/* Floating Glass Header */}
          <header className="sticky top-0 z-50 floating-header">
            <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <SidebarTrigger className="hover:bg-muted/50 rounded-xl transition-colors flex-shrink-0" />
                <h1 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight truncate">{title}</h1>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <NotificationBadge />
                <ThemeToggle />
                <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sair" className="rounded-xl h-9 w-9 sm:h-10 sm:w-10">
                  <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                </Button>
              </div>
            </div>
          </header>

          {/* Main Content Area */}
          <main className="px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 overflow-x-hidden">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
