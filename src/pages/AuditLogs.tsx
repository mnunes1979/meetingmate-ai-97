import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Shield, Activity, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

const AuditLogs = () => {
  const { t } = useTranslation();
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ["audit-logs", selectedAction],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (selectedAction) {
        query = query.eq("action", selectedAction);
      }

      const { data: logs, error } = await query;
      if (error) throw error;

      // Fetch user profiles separately
      const userIds = logs?.map(log => log.user_id).filter(Boolean) || [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", userIds);

      // Merge profiles with logs
      return logs?.map(log => ({
        ...log,
        profile: profiles?.find(p => p.id === log.user_id)
      }));
    },
  });

  const { data: actionStats } = useQuery({
    queryKey: ["audit-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("action")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      
      if (error) throw error;
      
      const stats = data.reduce((acc: Record<string, number>, log) => {
        acc[log.action] = (acc[log.action] || 0) + 1;
        return acc;
      }, {});
      
      return stats;
    },
  });

  const getActionBadgeVariant = (action: string) => {
    if (action.includes("delete") || action.includes("revoke")) return "destructive";
    if (action.includes("create") || action.includes("connect")) return "default";
    if (action.includes("update") || action.includes("modify")) return "secondary";
    return "outline";
  };

  const getActionIcon = (action: string) => {
    if (action.includes("security") || action.includes("auth")) return <Shield className="h-4 w-4" />;
    if (action.includes("delete") || action.includes("failed")) return <AlertTriangle className="h-4 w-4" />;
    return <Activity className="h-4 w-4" />;
  };

  return (
    <AdminLayout title={t("auditLogs.title", "Security Audit Logs")}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{t("auditLogs.title", "Security Audit Logs")}</h1>
          <p className="text-muted-foreground">
            {t("auditLogs.description", "Monitor security events and user actions across the application")}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("auditLogs.totalEvents", "Total Events (24h)")}
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {actionStats ? Object.values(actionStats).reduce((a, b) => a + b, 0) : 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("auditLogs.uniqueActions", "Unique Actions")}
              </CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {actionStats ? Object.keys(actionStats).length : 0}
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                {t("auditLogs.topActions", "Top Actions (24h)")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {actionStats &&
                  Object.entries(actionStats)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([action, count]) => (
                      <Badge
                        key={action}
                        variant={selectedAction === action ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => setSelectedAction(selectedAction === action ? null : action)}
                      >
                        {action} ({count})
                      </Badge>
                    ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("auditLogs.recentEvents", "Recent Events")}</CardTitle>
            <CardDescription>
              {selectedAction
                ? t("auditLogs.filteredBy", `Filtered by: ${selectedAction}`)
                : t("auditLogs.showingAll", "Showing all events (last 100)")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("auditLogs.timestamp", "Timestamp")}</TableHead>
                  <TableHead>{t("auditLogs.user", "User")}</TableHead>
                  <TableHead>{t("auditLogs.action", "Action")}</TableHead>
                  <TableHead>{t("auditLogs.resource", "Resource")}</TableHead>
                  <TableHead>{t("auditLogs.ipAddress", "IP Address")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    </TableRow>
                  ))
                ) : auditLogs && auditLogs.length > 0 ? (
                  auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs">
                        {format(new Date(log.created_at), "MMM dd, HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {log.profile?.name || t("common.unknown", "Unknown")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {log.profile?.email || "-"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {log.action && (
                          <Badge variant={getActionBadgeVariant(log.action)} className="gap-1">
                            {getActionIcon(log.action)}
                            {log.action}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {log.resource_type as string || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {(log.ip_address as string) || "-"}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {t("auditLogs.noEvents", "No audit events found")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AuditLogs;
