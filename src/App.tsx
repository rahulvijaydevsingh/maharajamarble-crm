import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { HRModuleProvider } from "@/contexts/HRModuleContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { TaskDetailModalProvider } from "@/contexts/TaskDetailModalContext";
import { ZLayerProvider } from "@/contexts/ZLayerContext";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import Index from "./pages/Index";
import Leads from "./pages/Leads";
import Customers from "./pages/Customers";
import Tasks from "./pages/Tasks";
import TaskDetailPage from "./pages/TaskDetailPage";
import TodoLists from "./pages/TodoLists";
import CalendarPage from "./pages/CalendarPage";
import Quotations from "./pages/Quotations";
import Professionals from "./pages/Professionals";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import AutomationRules from "./pages/AutomationRules";
import Messages from "./pages/Messages";
import ApiDocs from "./pages/ApiDocs";
import HRAttendance from "./pages/HRAttendance";
import HRAdminAttendance from "./pages/HRAdminAttendance";
import HRAttendanceGrid from "./pages/HRAttendanceGrid";
import HRLeave from "./pages/HRLeave";
import HRLeaveApprovals from "./pages/HRLeaveApprovals";
import HRPayroll from "./pages/HRPayroll";
import PerformanceMatrix from "./pages/PerformanceMatrix";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HRModuleProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ZLayerProvider>
              <TaskDetailModalProvider>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                  <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
                  <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
                  <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
                  <Route path="/tasks/:id" element={<ProtectedRoute><TaskDetailPage /></ProtectedRoute>} />
                  <Route path="/todo-lists" element={<ProtectedRoute><TodoLists /></ProtectedRoute>} />
                  <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
                  <Route path="/quotations" element={<ProtectedRoute><Quotations /></ProtectedRoute>} />
                  <Route path="/professionals" element={<ProtectedRoute><Professionals /></ProtectedRoute>} />
                  <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute requiredRole="admin"><Settings /></ProtectedRoute>} />
                  <Route path="/automation" element={<ProtectedRoute requiredRole="admin"><AutomationRules /></ProtectedRoute>} />
                  <Route path="/automation/:entityType" element={<ProtectedRoute requiredRole="admin"><AutomationRules /></ProtectedRoute>} />
                  <Route path="/api-docs" element={<ProtectedRoute requiredRole="admin"><ApiDocs /></ProtectedRoute>} />
                  <Route path="/hr/attendance" element={<ProtectedRoute><HRAttendance /></ProtectedRoute>} />
                  <Route path="/hr/admin-attendance" element={<ProtectedRoute requiredRole="admin"><HRAdminAttendance /></ProtectedRoute>} />
                  <Route path="/hr/attendance-grid" element={<ProtectedRoute requiredRole="admin"><HRAttendanceGrid /></ProtectedRoute>} />
                  <Route path="/hr/leave" element={<ProtectedRoute><HRLeave /></ProtectedRoute>} />
                  <Route path="/hr/leave-approvals" element={<ProtectedRoute requiredRole="admin"><HRLeaveApprovals /></ProtectedRoute>} />
                  <Route path="/hr/payroll" element={<ProtectedRoute requiredRole="admin"><HRPayroll /></ProtectedRoute>} />
                  <Route path="/hr" element={<ProtectedRoute><HRAttendance /></ProtectedRoute>} />
                  <Route path="/performance" element={<ProtectedRoute requiredRole="admin"><PerformanceMatrix /></ProtectedRoute>} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </TaskDetailModalProvider>
            </ZLayerProvider>
          </BrowserRouter>
        </TooltipProvider>
        </HRModuleProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
