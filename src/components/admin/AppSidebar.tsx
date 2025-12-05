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
import { Home, FileText, BarChart3, Building2, Users, Settings, Shield, Key, Server } from "lucide-react";
import { useUserAccess } from "@/hooks/useUserAccess";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Reuniões", url: "/admin", icon: FileText },
  { title: "Analítica de Email", url: "/email-analytics", icon: BarChart3 },
  { title: "Departamentos", url: "/departments", icon: Building2 },
  { title: "Utilizadores", url: "/admin/users", icon: Users },
  { title: "Logs de Segurança", url: "/admin/audit-logs", icon: Shield },
  { title: "API Keys", url: "/admin/api-keys", icon: Key },
  { title: "Control Panel", url: "/admin/control-panel", icon: Server },
  { title: "Configurações", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const { accessType, loading } = useUserAccess();

  // Filter items based on access type
  const filteredItems = useMemo(() => {
    if (loading) return items;
    
    // For renewals_only users, redirect to settings only
    if (accessType === 'renewals_only') {
      return items.filter(item => item.url === '/settings');
    }
    
    return items;
  }, [accessType, loading]);

  const groups = useMemo(() => [{ label: "Admin", entries: filteredItems }], [filteredItems]);

  return (
    <Sidebar className={state === "collapsed" ? "w-14" : "w-60"}>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.entries.map((item) => {
                  const isActive = currentPath === item.url;
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={isActive} className="hover:bg-muted/50">
                        <NavLink
                          to={item.url}
                          end
                          className="flex items-center"
                          activeClassName="bg-muted text-primary font-medium"
                        >
                          <Icon className="mr-2 h-4 w-4" />
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
