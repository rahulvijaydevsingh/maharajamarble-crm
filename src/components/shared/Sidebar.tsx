import React, { useState } from "react";
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

interface NavigationItem {
  name: string;
  icon: React.ElementType;
  path: string;
  count?: number;
}

const mainNavigation: NavigationItem[] = [
  { name: "Dashboard", icon: Home, path: "/" },
  { name: "Leads", icon: Phone, path: "/leads", count: 12 },
  { name: "Customers", icon: Users, path: "/customers" },
  { name: "Tasks", icon: ListTodo, path: "/tasks", count: 5 },
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
              {mainNavigation.map((item) => (
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
                      {item.count && (
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
