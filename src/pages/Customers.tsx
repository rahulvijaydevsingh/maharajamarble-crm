import React, { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EnhancedCustomerTable } from "@/components/customers/EnhancedCustomerTable";
import { SmartCustomerForm } from "@/components/customers/SmartCustomerForm";
import { Customer } from "@/hooks/useCustomers";

const Customers = () => {
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const handleEdit = (customer: Customer) => {
    // Editing is handled within EnhancedCustomerTable via CustomerDetailView
  };

  const handleAdd = () => {
    setAddDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-1">Customers</h1>
          <p className="text-muted-foreground">Manage your customer relationships and view purchasing history</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Customer Management</CardTitle>
            <CardDescription>View, filter, and manage all customers with advanced filtering and export capabilities</CardDescription>
          </CardHeader>
          <CardContent>
            <EnhancedCustomerTable onEdit={handleEdit} onAdd={handleAdd} />
          </CardContent>
        </Card>

        <SmartCustomerForm 
          open={addDialogOpen} 
          onOpenChange={setAddDialogOpen}
        />
      </div>
    </DashboardLayout>
  );
};

export default Customers;