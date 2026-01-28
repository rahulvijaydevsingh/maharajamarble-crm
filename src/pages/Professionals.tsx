import React, { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EnhancedProfessionalTable } from "@/components/professionals/EnhancedProfessionalTable";
import { AddProfessionalDialog } from "@/components/professionals/AddProfessionalDialog";
import { Professional } from "@/hooks/useProfessionals";

const Professionals = () => {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);

  const handleEdit = (professional: Professional) => {
    setEditingProfessional(professional);
    setAddDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingProfessional(null);
    setAddDialogOpen(true);
  };

  const handleDialogClose = () => {
    setAddDialogOpen(false);
    setEditingProfessional(null);
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
            <EnhancedProfessionalTable onEdit={handleEdit} onAdd={handleAdd} />
          </CardContent>
        </Card>

        <AddProfessionalDialog 
          open={addDialogOpen} 
          onOpenChange={handleDialogClose}
          editingProfessional={editingProfessional}
        />
      </div>
    </DashboardLayout>
  );
};

export default Professionals;
