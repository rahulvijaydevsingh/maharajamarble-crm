import { useState, useEffect, useRef, useCallback } from "react";
import { Search, User, Settings, LogOut, Plus, Users, Phone, Briefcase, FileText, CheckSquare, ListTodo, Loader2 } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface SearchResult {
  id: string;
  type: "lead" | "customer" | "professional" | "task" | "quotation";
  name: string;
  secondary: string;
  url: string;
}

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  lead: <Phone className="h-4 w-4 text-blue-500" />,
  customer: <Users className="h-4 w-4 text-green-500" />,
  professional: <Briefcase className="h-4 w-4 text-purple-500" />,
  task: <CheckSquare className="h-4 w-4 text-orange-500" />,
  quotation: <FileText className="h-4 w-4 text-indigo-500" />,
};

export function Header() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { toast } = useToast();

  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [addProfessionalOpen, setAddProfessionalOpen] = useState(false);
  const [addQuotationOpen, setAddQuotationOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addTodoOpen, setAddTodoOpen] = useState(false);

  // Global search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }

    setIsSearching(true);
    const results: SearchResult[] = [];
    const pattern = `%${query}%`;

    try {
      const [leadsRes, customersRes, professionalsRes, tasksRes, quotationsRes] = await Promise.all([
        supabase.from("leads").select("id, name, phone, email, status").or(`name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`).limit(5),
        supabase.from("customers").select("id, name, phone, email").or(`name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`).limit(5),
        supabase.from("professionals").select("id, name, phone, firm_name").or(`name.ilike.${pattern},phone.ilike.${pattern},firm_name.ilike.${pattern}`).limit(5),
        supabase.from("tasks").select("id, title, status, assigned_to").or(`title.ilike.${pattern}`).limit(5),
        supabase.from("quotations").select("id, quotation_number, client_name, status").or(`quotation_number.ilike.${pattern},client_name.ilike.${pattern}`).limit(5),
      ]);

      leadsRes.data?.forEach(l => results.push({ id: l.id, type: "lead", name: l.name, secondary: l.phone || l.email || "", url: `/leads?view=${l.id}` }));
      customersRes.data?.forEach(c => results.push({ id: c.id, type: "customer", name: c.name, secondary: c.phone || c.email || "", url: `/customers?view=${c.id}` }));
      professionalsRes.data?.forEach(p => results.push({ id: p.id, type: "professional", name: p.name, secondary: p.firm_name || p.phone || "", url: `/professionals?view=${p.id}` }));
      tasksRes.data?.forEach(t => results.push({ id: t.id, type: "task", name: t.title, secondary: t.status || "", url: `/tasks?view=${t.id}` }));
      quotationsRes.data?.forEach(q => results.push({ id: q.id, type: "quotation", name: q.quotation_number, secondary: q.client_name || "", url: `/quotations?view=${q.id}` }));
    } catch (err) {
      console.error("Search error:", err);
    }

    setSearchResults(results);
    setSearchOpen(results.length > 0);
    setSelectedIndex(-1);
    setIsSearching(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(searchQuery), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, performSearch]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!searchOpen || searchResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % searchResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      const result = searchResults[selectedIndex];
      navigate(result.url);
      setSearchQuery("");
      setSearchOpen(false);
    } else if (e.key === "Escape") {
      setSearchOpen(false);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    navigate(result.url);
    setSearchQuery("");
    setSearchOpen(false);
  };

  const handleLogout = async () => {
    try {
      await signOut();
      toast({ title: "Logged out", description: "You have been successfully logged out." });
      navigate("/auth");
    } catch (error) {
      toast({ title: "Error", description: "Failed to log out. Please try again.", variant: "destructive" });
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
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  {isSearching && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground animate-spin" />}
                  <Input
                    ref={searchInputRef}
                    type="search"
                    placeholder="Search leads, customers, tasks..."
                    className="w-full appearance-none bg-background pl-8 shadow-none md:w-2/3 lg:w-full"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={() => { if (searchResults.length > 0) setSearchOpen(true); }}
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 max-h-[400px] overflow-y-auto" align="start" sideOffset={4} onOpenAutoFocus={(e) => e.preventDefault()}>
                {searchResults.length === 0 && searchQuery.length >= 2 && !isSearching ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">No results found</div>
                ) : (
                  <div className="py-1">
                    {searchResults.map((result, idx) => (
                      <button
                        key={`${result.type}-${result.id}`}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted transition-colors ${idx === selectedIndex ? 'bg-muted' : ''}`}
                        onClick={() => handleResultClick(result)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        {ENTITY_ICONS[result.type]}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{result.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{result.secondary}</div>
                        </div>
                        <span className="text-xs text-muted-foreground capitalize shrink-0">{result.type}</span>
                      </button>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
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
