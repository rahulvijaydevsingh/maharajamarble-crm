import React, { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { 
  Home, 
  Users, 
  Phone, 
  Calendar, 
  FileText, 
  Settings,
  ListTodo,
  User,
  LogOut,
  Shield,
  Zap,
  MessageSquare
} from "lucide-react";
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface NavigationItem {
  name: string;
  icon: React.ElementType;
  path: string;
  count?: number;
}

const mainNavigation: NavigationItem[] = [
  { name: "Dashboard", icon: Home, path: "/" },
  { name: "Leads", icon: Phone, path: "/leads" },
  { name: "Customers", icon: Users, path: "/customers" },
  { name: "Tasks", icon: ListTodo, path: "/tasks" },
  { name: "To-Do Lists", icon: ListTodo, path: "/todo-lists" },
  { name: "Calendar", icon: Calendar, path: "/calendar" },
  { name: "Quotations", icon: FileText, path: "/quotations" },
  { name: "Professionals", icon: User, path: "/professionals" },
  { name: "Messages", icon: MessageSquare, path: "/messages" },
];

const adminNavigation: NavigationItem[] = [
  { name: "Workflow Automation", icon: Zap, path: "/automation" },
  { name: "Settings", icon: Settings, path: "/settings" },
];

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  sales_user: "Sales User",
  sales_viewer: "Viewer",
  field_agent: "Field Agent",
};

export function SidebarNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, role, signOut, isAdmin } = useAuth();
  const currentPath = location.pathname;

  const [leadCount, setLeadCount] = useState<number | null>(null);
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [countsLoading, setCountsLoading] = useState(false);
  
  const getActiveItem = () => {
    if (currentPath === "/") return "Dashboard";
    
    const item = [...mainNavigation, ...adminNavigation].find(
      item => currentPath.startsWith(item.path.split("?")[0]) && item.path !== "/"
    );
    
    return item ? item.name : "Dashboard";
  };

  // Show Control Panel and Settings for super_admin and admin roles
  const showAdminNav = role === "super_admin" || role === "admin";

  const [activeItem, setActiveItem] = useState(getActiveItem());

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const fetchSidebarCounts = async () => {
    // Avoid hammering on initial auth bootstrap.
    if (!profile?.email && !isAdmin) return;

    try {
      setCountsLoading(true);

      const [{ count: leadsCount, error: leadsError }, { count: tasksCount, error: tasksError }] =
        await Promise.all([
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .or("is_converted.is.null,is_converted.eq.false"),
          supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .neq("status", "Completed"),
        ]);

      if (leadsError) throw leadsError;
      if (tasksError) throw tasksError;

      setLeadCount(leadsCount ?? 0);
      setTaskCount(tasksCount ?? 0);
    } catch (error) {
      console.error("Error fetching sidebar counts:", error);
      // Fail silently: badges will hide instead of showing incorrect numbers.
      setLeadCount(null);
      setTaskCount(null);
    } finally {
      setCountsLoading(false);
    }
  };

  useEffect(() => {
    fetchSidebarCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.email, isAdmin]);

  // Keep counts live while the user stays on the same page (e.g., after creating a lead/task).
  useEffect(() => {
    if (!profile?.email && !isAdmin) return;

    const channel = supabase
      .channel("sidebar-counts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        () => fetchSidebarCounts()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => fetchSidebarCounts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.email, isAdmin]);

  // Optional refresh on route changes so the UI feels up-to-date after edits.
  useEffect(() => {
    fetchSidebarCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  const navigationWithCounts = useMemo(() => {
    return mainNavigation.map((item) => {
      if (item.name === "Leads") {
        return { ...item, count: leadCount ?? undefined };
      }
      if (item.name === "Tasks") {
        return { ...item, count: taskCount ?? undefined };
      }
      return item;
    });
  }, [leadCount, taskCount]);
  
  return (
    <Sidebar className="border-r border-gray-200">
      <div className="flex items-center justify-center h-16 mb-6 pt-4">
        <h1 className="text-xl font-bold text-white">
          <span className="text-marble-accent">Maharaja</span> CRM
        </h1>
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationWithCounts.map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton 
                    asChild
                    className={cn(
                      "flex justify-between w-full",
                      activeItem === item.name && "bg-sidebar-accent text-sidebar-accent-foreground"
                    )}
                    onClick={() => setActiveItem(item.name)}
                  >
                    <Link to={item.path} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <item.icon className="mr-3 h-5 w-5" />
                        <span>{item.name}</span>
                      </div>
                      {typeof item.count === "number" && !countsLoading && (
                        <span className="bg-marble-accent text-marble-primary text-xs font-medium px-2 py-0.5 rounded-full">
                          {item.count}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {showAdminNav && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNavigation.map((item) => (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton 
                      asChild
                      className={cn(
                        activeItem === item.name && "bg-sidebar-accent text-sidebar-accent-foreground"
                      )}
                      onClick={() => setActiveItem(item.name)}
                    >
                      <Link to={item.path}>
                        <item.icon className="mr-3 h-5 w-5" />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <div className="mt-auto p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="w-full bg-marble-accent text-marble-primary hover:bg-marble-accent/90 justify-start">
              <User className="mr-2 h-4 w-4" />
              <span className="truncate flex-1 text-left">
                {profile?.full_name || profile?.email || "User"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {profile?.full_name || "User"}
                </p>
                <p className="text-xs leading-none text-muted-foreground">
                  {profile?.email}
                </p>
                {role && (
                  <Badge variant="secondary" className="w-fit mt-1">
                    <Shield className="h-3 w-3 mr-1" />
                    {roleLabels[role] || role}
                  </Badge>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Sidebar>
  );
}
