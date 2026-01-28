import React, { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  Download, 
  FileText, 
  Plus, 
  Search, 
  Share2,
  Edit,
  Trash2,
  Copy,
  MoreHorizontal,
  Loader2,
} from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQuotations } from "@/hooks/useQuotations";
import { AddQuotationDialog } from "@/components/quotations/AddQuotationDialog";
import { QUOTATION_STATUSES, Quotation } from "@/types/quotation";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollableTableContainer } from "@/components/shared/ScrollableTableContainer";

const ITEMS_PER_PAGE = 10;

const Quotations = () => {
  const { quotations, loading, deleteQuotation, getQuotationWithItems } = useQuotations();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editQuotation, setEditQuotation] = useState<Quotation | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [quotationToDelete, setQuotationToDelete] = useState<string | null>(null);

  // Filter quotations
  const filteredQuotations = useMemo(() => {
    return quotations.filter((q) => {
      const matchesSearch = 
        q.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.quotation_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (q.notes && q.notes.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesStatus = statusFilter === "all" || q.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [quotations, searchQuery, statusFilter]);

  // Paginate
  const totalPages = Math.ceil(filteredQuotations.length / ITEMS_PER_PAGE);
  const paginatedQuotations = filteredQuotations.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getStatusStyle = (status: string) => {
    const statusConfig = QUOTATION_STATUSES.find(s => s.value === status);
    return statusConfig?.color || 'bg-gray-100 text-gray-700';
  };

  const getStatusLabel = (status: string) => {
    const statusConfig = QUOTATION_STATUSES.find(s => s.value === status);
    return statusConfig?.label || status;
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(paginatedQuotations.map(q => q.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter(i => i !== id));
    }
  };

  const handleEdit = async (quotation: Quotation) => {
    const fullQuotation = await getQuotationWithItems(quotation.id);
    if (fullQuotation) {
      setEditQuotation(fullQuotation);
      setAddDialogOpen(true);
    }
  };

  const handleDelete = (id: string) => {
    setQuotationToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (quotationToDelete) {
      await deleteQuotation(quotationToDelete);
      setQuotationToDelete(null);
      setDeleteConfirmOpen(false);
    }
  };

  const handleDuplicate = async (quotation: Quotation) => {
    const fullQuotation = await getQuotationWithItems(quotation.id);
    if (fullQuotation) {
      // Create a new quotation with same data but no ID
      setEditQuotation(null);
      // We'll use prefill data for duplicating
      setAddDialogOpen(true);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1">Quotations</h1>
            <p className="text-muted-foreground">
              Manage quotations and proposals for your clients
            </p>
          </div>
          <Button className="w-full md:w-auto" onClick={() => {
            setEditQuotation(null);
            setAddDialogOpen(true);
          }}>
            <Plus className="mr-2 h-4 w-4" />
            Create New Quotation
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Quotation Management</CardTitle>
            <CardDescription>
              View and manage all client quotations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search quotations by ID, client or project..."
                  className="pl-8 w-full"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
              <div className="flex gap-2">
                <div className="w-40">
                  <Select 
                    value={statusFilter} 
                    onValueChange={(value) => {
                      setStatusFilter(value);
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      {QUOTATION_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            
            <ScrollableTableContainer maxHeight="calc(100vh - 400px)">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                  <TableRow>
                    <TableHead className="w-12 bg-background">
                      <Checkbox
                        checked={selectedIds.length === paginatedQuotations.length && paginatedQuotations.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="bg-background">Quotation ID</TableHead>
                    <TableHead className="bg-background">Client</TableHead>
                    <TableHead className="bg-background">Amount</TableHead>
                    <TableHead className="bg-background">Date</TableHead>
                    <TableHead className="bg-background">Status</TableHead>
                    <TableHead className="bg-background">Assigned To</TableHead>
                    <TableHead className="text-right bg-background">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center">
                        <div className="flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin mr-2" />
                          Loading quotations...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : paginatedQuotations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        {searchQuery || statusFilter !== "all" 
                          ? "No quotations match your filters."
                          : "No quotations yet. Create the first one!"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedQuotations.map((quote) => (
                      <TableRow key={quote.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(quote.id)}
                            onCheckedChange={(checked) => handleSelectOne(quote.id, !!checked)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{quote.quotation_number}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{quote.client_name}</div>
                            {quote.client_phone && (
                              <div className="text-sm text-muted-foreground">{quote.client_phone}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{formatCurrency(quote.total)}</TableCell>
                        <TableCell>{format(new Date(quote.quotation_date), 'dd MMM yyyy')}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={getStatusStyle(quote.status)}>
                            {getStatusLabel(quote.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{quote.assigned_to}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(quote)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicate(quote)}>
                                <Copy className="h-4 w-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <FileText className="h-4 w-4 mr-2" />
                                View
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Download className="h-4 w-4 mr-2" />
                                Download PDF
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Share2 className="h-4 w-4 mr-2" />
                                Send Email
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => handleDelete(quote.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
              </TableBody>
            </Table>
          </ScrollableTableContainer>

            {totalPages > 1 && (
              <div className="mt-6">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum = i + 1;
                      if (totalPages > 5) {
                        if (currentPage > 3) {
                          pageNum = currentPage - 2 + i;
                        }
                        if (pageNum > totalPages) {
                          pageNum = totalPages - 4 + i;
                        }
                      }
                      return (
                        <PaginationItem key={pageNum}>
                          <PaginationLink
                            onClick={() => setCurrentPage(pageNum)}
                            isActive={currentPage === pageNum}
                            className="cursor-pointer"
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AddQuotationDialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          setAddDialogOpen(open);
          if (!open) setEditQuotation(null);
        }}
        editQuotation={editQuotation}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quotation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this quotation? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Quotations;
