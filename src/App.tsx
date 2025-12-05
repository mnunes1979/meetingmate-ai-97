import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import Dashboard from "./pages/Dashboard";
import UserManagement from "./pages/UserManagement";
import MeetingDetail from "./pages/MeetingDetail";
import MyMeetings from "./pages/MyMeetings";
import Departments from "./pages/Departments";
import Settings from "./pages/Settings";
import EmailAnalytics from "./pages/EmailAnalytics";
import AuditLogs from "./pages/AuditLogs";
import ApiKeys from "./pages/ApiKeys";
import AdminControlPanel from "./pages/AdminControlPanel";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/meeting/:id" element={<MeetingDetail />} />
          <Route path="/meeting/:id" element={<MeetingDetail />} />
          <Route path="/my-meetings" element={<MyMeetings />} />
          <Route path="/admin/dashboard" element={<Dashboard />} />
          <Route path="/admin/users" element={<UserManagement />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/departments" element={<Departments />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/email-analytics" element={<EmailAnalytics />} />
          <Route path="/admin/audit-logs" element={<AuditLogs />} />
          <Route path="/admin/api-keys" element={<ApiKeys />} />
          <Route path="/admin/control-panel" element={<AdminControlPanel />} />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
