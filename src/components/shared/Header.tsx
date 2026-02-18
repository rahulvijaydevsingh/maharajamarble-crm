import { useState } from "react";
import { Search, User, Settings, LogOut, Plus, Users, Phone, Briefcase, FileText, CheckSquare, ListTodo } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { NotificationDropdown } from "./NotificationDropdown";
import { AddCustomerDialog } from "@/components/customers/AddCustomerDialog";
import { AddProfessionalDialog } from "@/components/professionals/AddProfessionalDialog";
import { AddQuotationDialog } from "@/components/quotations/AddQuotationDialog";
import { AddTaskDialog } from "@/components/tasks/AddTaskDialog";
import { AddTodoListDialog } from "@/components/todos/AddTodoListDialog";

export function Header() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { toast } = useToast();

  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [addProfessionalOpen, setAddProfessionalOpen] = useState(false);
  const [addQuotationOpen, setAddQuotationOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addTodoOpen, setAddTodoOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut();
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
      navigate("/auth");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to log out. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    }
    return "U";
  };

  const getDisplayName = () => {
    return profile?.full_name || profile?.email || "User";
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 md:h-16 items-center gap-2 md:gap-4 border-b bg-background px-3 md:px-6">
        <SidebarTrigger />
        <div className="w-full flex justify-between items-center">
          <div className="relative w-full max-w-md hidden sm:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search..."
              className="w-full appearance-none bg-background pl-8 shadow-none md:w-2/3 lg:w-full"
            />
          </div>
          <div className="flex items-center gap-2 md:gap-4 ml-auto">
            {/* Quick Add Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0">
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Quick Add</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/leads")}>
                  <Phone className="h-4 w-4 mr-2" />Add Lead
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAddCustomerOpen(true)}>
                  <Users className="h-4 w-4 mr-2" />Add Customer
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAddProfessionalOpen(true)}>
                  <Briefcase className="h-4 w-4 mr-2" />Add Professional
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setAddQuotationOpen(true)}>
                  <FileText className="h-4 w-4 mr-2" />Add Quotation
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAddTaskOpen(true)}>
                  <CheckSquare className="h-4 w-4 mr-2" />Add Task
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAddTodoOpen(true)}>
                  <ListTodo className="h-4 w-4 mr-2" />Add To-Do List
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <NotificationDropdown />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="flex items-center gap-2 hover:bg-transparent"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-marble-primary text-marble-light">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:inline-flex">{getDisplayName()}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Quick Add Dialogs */}
      <AddCustomerDialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen} />
      <AddProfessionalDialog open={addProfessionalOpen} onOpenChange={setAddProfessionalOpen} />
      <AddQuotationDialog open={addQuotationOpen} onOpenChange={setAddQuotationOpen} />
      <AddTaskDialog open={addTaskOpen} onOpenChange={setAddTaskOpen} onTaskCreate={() => { setAddTaskOpen(false); toast({ title: "Task created" }); }} />
      <AddTodoListDialog open={addTodoOpen} onOpenChange={setAddTodoOpen} />
    </>
  );
}
