import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EnhancedProfessionalTable } from "@/components/professionals/EnhancedProfessionalTable";
import { AddProfessionalDialog } from "@/components/professionals/AddProfessionalDialog";
import { ProfessionalDetailView } from "@/components/professionals/ProfessionalDetailView";
import { BulkProfessionalUploadDialog } from "@/components/professionals/BulkProfessionalUploadDialog";
import { Professional, useProfessionals } from "@/hooks/useProfessionals";

const Professionals = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null);
  const [detailViewOpen, setDetailViewOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<string | undefined>();
  const { professionals, refetch, deleteProfessional } = useProfessionals();

  // Handle URL deep-linking
  useEffect(() => {
    const selectedId = searchParams.get("selected");
    const tab = searchParams.get("tab");
    if (selectedId && professionals.length > 0) {
      const found = professionals.find(p => p.id === selectedId);
      if (found) {
        setSelectedProfessional(found);
        setInitialTab(tab || undefined);
        setDetailViewOpen(true);
      }
    }
  }, [searchParams, professionals]);

  const handleSelectProfessional = (professional: Professional) => {
    setSelectedProfessional(professional);
    setInitialTab(undefined);
    setDetailViewOpen(true);
    setSearchParams({ selected: professional.id });
  };

  const handleDetailViewClose = (open: boolean) => {
    setDetailViewOpen(open);
    if (!open) {
      setSelectedProfessional(null);
      searchParams.delete("selected");
      searchParams.delete("tab");
      setSearchParams(searchParams);
    }
  };

  const handleEdit = (professional: Professional) => {
    setEditingProfessional(professional);
    setAddDialogOpen(true);
    // Close detail view if open
    if (detailViewOpen) {
      setDetailViewOpen(false);
    }
  };

  const handleAdd = () => {
    setEditingProfessional(null);
    setAddDialogOpen(true);
  };

  const handleDialogClose = () => {
    setAddDialogOpen(false);
    setEditingProfessional(null);
  };

  const handleDelete = async (id: string) => {
    await deleteProfessional(id);
    setDetailViewOpen(false);
    setSelectedProfessional(null);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-1">Professionals</h1>
          <p className="text-muted-foreground">Manage architects, interior designers, and other professionals</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Professional Directory</CardTitle>
            <CardDescription>View, filter, and manage all professionals with advanced filtering capabilities</CardDescription>
          </CardHeader>
          <CardContent>
            <EnhancedProfessionalTable 
              onEdit={handleEdit} 
              onAdd={handleAdd}
              onSelectProfessional={handleSelectProfessional}
              onBulkUpload={() => setBulkUploadOpen(true)}
            />
          </CardContent>
        </Card>

        <AddProfessionalDialog 
          open={addDialogOpen} 
          onOpenChange={handleDialogClose}
          editingProfessional={editingProfessional}
        />

        <ProfessionalDetailView
          professional={selectedProfessional}
          open={detailViewOpen}
          onOpenChange={handleDetailViewClose}
          onEdit={handleEdit}
          onDelete={handleDelete}
          initialTab={initialTab}
        />

        <BulkProfessionalUploadDialog
          open={bulkUploadOpen}
          onOpenChange={setBulkUploadOpen}
          onProfessionalsCreated={refetch}
        />
      </div>
    </DashboardLayout>
  );
};

export default Professionals;
