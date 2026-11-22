import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { HRModuleProvider } from "@/contexts/HRModuleContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { TaskDetailModalProvider } from "@/contexts/TaskDetailModalContext";
import { ZLayerProvider } from "@/contexts/ZLayerContext";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { BackupJobsProvider } from "@/contexts/BackupJobsContext";
import { MobileWorkspaceLauncher } from "@/mobile/routing/WorkspaceGate";
import { BackupJobNotifier } from "@/components/shared/BackupJobNotifier";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { TasksProvider } from "@/hooks/useTasks";
import { LeadsProvider } from "@/hooks/useLeads";
import { CustomersProvider } from "@/hooks/useCustomers";
import { NotificationsProvider } from "@/hooks/useNotifications";
import { ChatProvider } from "@/hooks/useChat";
import { CalendarProvider } from "@/hooks/useCalendarEvents";
import { TodoListsProvider } from "@/hooks/useTodoLists";
import { ProfessionalsProvider } from "@/hooks/useProfessionals";
import { SystemSettingsProvider } from "@/hooks/useSystemSettings";
import { PendingTasksByLeadProvider } from "@/hooks/usePendingTasksByLead";
import { PendingTasksByCustomerProvider } from "@/hooks/usePendingTasksByCustomer";
import { PendingTasksByProfessionalProvider } from "@/hooks/usePendingTasksByProfessional";

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

// The mobile workspace (/m) is loaded lazily so the desktop bundle is not
// bloated by the mobile screens. This is the first code-split in the app.
const MobileApp = lazy(() => import("@/mobile/MobileApp"));

function MobileWorkspaceFallback() {
  return (
    <div className="min-h-[100dvh] bg-[#F8F9FA] flex items-center justify-center p-6">
      <div className="text-center space-y-2">
        <div className="text-base font-bold text-[#1A1A2E]">Loading mobile workspace…</div>
        <div className="text-xs text-[#47464C]">Maharaja Marble CRM</div>
      </div>
    </div>
  );
}

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
            <LeadsProvider>
              <CustomersProvider>
                <TasksProvider>
                  <ProfessionalsProvider>
                    <SystemSettingsProvider>
                      <TodoListsProvider>
                        <NotificationsProvider>
                          <ChatProvider>
                            <RemindersProvider>
                              <BackupJobsProvider>
                                <BackupJobNotifier />
                                <ZLayerProvider>
                                  <TaskDetailModalProvider>
                                    <Routes>
                                      <Route path="/auth" element={<Auth />} />
                                      <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                                      <Route path="/leads" element={<ProtectedRoute><PendingTasksByLeadProvider><Leads /></PendingTasksByLeadProvider></ProtectedRoute>} />
                                      <Route path="/customers" element={<ProtectedRoute><PendingTasksByCustomerProvider><Customers /></PendingTasksByCustomerProvider></ProtectedRoute>} />
                                      <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
                                      <Route path="/tasks/:id" element={<ProtectedRoute><TaskDetailPage /></ProtectedRoute>} />
                                      <Route path="/todo-lists" element={<ProtectedRoute><TodoLists /></ProtectedRoute>} />
                                      <Route path="/calendar" element={<ProtectedRoute><CalendarProvider><CalendarPage /></CalendarProvider></ProtectedRoute>} />
                                      <Route path="/quotations" element={<ProtectedRoute><Quotations /></ProtectedRoute>} />
                                      <Route path="/professionals" element={<ProtectedRoute><PendingTasksByProfessionalProvider><Professionals /></PendingTasksByProfessionalProvider></ProtectedRoute>} />
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
                                      {/* Mobile workspace — lazy loaded, kept above the catch-all */}
                                      <Route path="/m" element={<Navigate to="/m/today" replace />} />
                                      <Route path="/m/*" element={<Suspense fallback={<MobileWorkspaceFallback />}><MobileApp /></Suspense>} />
                                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                                      <Route path="*" element={<NotFound />} />
                                    </Routes>
                                    <MobileWorkspaceLauncher />
                                  </TaskDetailModalProvider>
                                </ZLayerProvider>
                              </BackupJobsProvider>
                            </RemindersProvider>
                          </ChatProvider>
                        </NotificationsProvider>
                      </TodoListsProvider>
                    </SystemSettingsProvider>
                  </ProfessionalsProvider>
                </TasksProvider>
              </CustomersProvider>
            </LeadsProvider>
          </BrowserRouter>
        </TooltipProvider>
        </HRModuleProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
