import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Home, FileText, BarChart3, Building2, Users, Shield, Key, Server, FolderOpen } from "lucide-react";
import { useUserAccess } from "@/hooks/useUserAccess";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Reuniões", url: "/admin", icon: FileText },
  { title: "Gestão Reuniões", url: "/admin/meetings", icon: FolderOpen },
  { title: "Analítica de Email", url: "/email-analytics", icon: BarChart3 },
  { title: "Departamentos", url: "/departments", icon: Building2 },
  { title: "Utilizadores", url: "/admin/users", icon: Users },
  { title: "Logs de Segurança", url: "/admin/audit-logs", icon: Shield },
  { title: "API Keys", url: "/admin/api-keys", icon: Key },
  { title: "Control Panel", url: "/admin/control-panel", icon: Server },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const { accessType, loading } = useUserAccess();

  // Filter items based on access type
  const filteredItems = useMemo(() => {
    if (loading) return items;
    
    // For renewals_only users, show only renewals-related items
    if (accessType === 'renewals_only') {
      return [];
    }
    
    return items;
  }, [accessType, loading]);

  const groups = useMemo(() => [{ label: "Admin", entries: filteredItems }], [filteredItems]);

  return (
    <Sidebar 
      className={`${state === "collapsed" ? "w-14" : "w-64"} floating-sidebar transition-all duration-300`}
    >
      <SidebarContent className="py-4">
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent className="mt-2">
              <SidebarMenu className="space-y-1 px-2">
                {group.entries.map((item) => {
                  const isActive = currentPath === item.url;
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        className={`
                          rounded-xl px-3 py-2.5 transition-all duration-200
                          hover:bg-muted/50
                          ${isActive ? 'bg-primary/10 text-primary font-medium shadow-sm' : ''}
                        `}
                      >
                        <NavLink
                          to={item.url}
                          end
                          className="flex items-center gap-3"
                          activeClassName=""
                        >
                          <Icon className={`h-5 w-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                          <span className="truncate">{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
