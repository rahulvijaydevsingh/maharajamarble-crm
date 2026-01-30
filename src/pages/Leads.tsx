import React, { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { EnhancedLeadTable } from "@/components/leads/EnhancedLeadTable";
import { SmartLeadForm } from "@/components/leads/SmartLeadForm";
import { BulkUploadDialog } from "@/components/leads/BulkUploadDialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, Upload } from "lucide-react";
import { useLeads, LeadInsert } from "@/hooks/useLeads";
import { useTasks } from "@/hooks/useTasks";
import { useToast } from "@/hooks/use-toast";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { format } from "date-fns";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";

const Leads = () => {
  const [addLeadDialogOpen, setAddLeadDialogOpen] = useState(false);
  const [bulkUploadDialogOpen, setBulkUploadDialogOpen] = useState(false);
  const { addLead, refetch } = useLeads();
  const { addTask } = useTasks();
  const { toast } = useToast();
  const { canCreate } = usePermissions();
  const { staffMembers } = useActiveStaff();

  const handleAddLead = async (formData: any, generatedTask: any) => {
    try {
      const normalizePhone = (phone: string): string => {
        const digits = String(phone || "").replace(/\D/g, "");
        return digits.slice(-10);
      };

      // Create lead in database
      const leadData: LeadInsert = {
        name: formData.fullName,
        phone: formData.primaryPhone,
        alternate_phone: formData?.contacts?.[0]?.alternatePhone
          ? normalizePhone(formData.contacts[0].alternatePhone)
          : null,
        email: formData.email || null,
        designation: formData?.contacts?.[0]?.designation || (formData.leadCategory === "professional" ? "architect" : "owner"),
        firm_name: formData.firmName || null,
        site_location: formData.siteLocation,
        site_plus_code: formData.sitePlusCode || null,
        site_photo_url: formData.sitePhotoUrl || null,
        construction_stage: formData.constructionStage,
        estimated_quantity: formData.estimatedQuantity,
        material_interests: formData.materialInterests,
        source: formData.leadSource,
        referred_by: formData.referredBy,
        assigned_to: staffMembers.find(m => m.id === formData.assignedTo)?.name || formData.assignedTo,
        status: "new",
        priority: formData.followUpPriority === "urgent" ? 1 : formData.followUpPriority === "normal" ? 3 : 5,
        notes: formData.initialNote || null,
        additional_contacts: Array.isArray(formData?.contacts)
          ? formData.contacts.slice(1).map((c: any) => ({
              designation: c.designation,
              name: c.name,
              email: c.email,
              phone: c.phone,
              alternatePhone: c.alternatePhone,
              firmName: c.firmName,
              isProfessional: !!c.isProfessional,
            }))
          : [],
        created_by: "Current User",
      };

      const newLead = await addLead(leadData);

      // Auto-create Professionals for professional-designation contacts.
      // If a phone already exists in Professionals, we skip creating the Professional (but keep the Lead).
      if (Array.isArray(formData?.contacts) && formData.contacts.length > 0) {
        const assignedToName = staffMembers.find(m => m.id === formData.assignedTo)?.name || formData.assignedTo;

        const createdPhones = new Set<string>();
        const professionalContacts = formData.contacts.filter((c: any) => c?.isProfessional);

        for (const c of professionalContacts) {
          const phone = normalizePhone(c.phone);
          if (phone.length !== 10) continue;
          if (createdPhones.has(phone)) continue;
          createdPhones.add(phone);

          const { data: existing } = await supabase
            .from("professionals")
            .select("id")
            .or(`phone.eq.${phone},alternate_phone.eq.${phone}`)
            .limit(1);

          if (existing && existing.length > 0) {
            // Skip duplicates silently.
            continue;
          }

          await supabase.from("professionals").insert([
            {
              name: c.name,
              phone,
              alternate_phone: c.alternatePhone ? normalizePhone(c.alternatePhone) : null,
              email: c.email || null,
              firm_name: c.firmName || null,
              address: formData.siteLocation || null,
              professional_type: c.designation,
              status: "active",
              priority: 3,
              assigned_to: assignedToName,
              site_plus_code: formData.sitePlusCode || null,
              created_by: "Current User",
            },
          ]);
        }
      }

      // Create associated task
      if (generatedTask && newLead) {
        await addTask({
          title: generatedTask.title,
          description: generatedTask.description,
          type: "Follow-up Call",
          priority: generatedTask.priority === "high" ? "High" : generatedTask.priority === "medium" ? "Medium" : "Low",
          status: "Pending",
          assigned_to: generatedTask.assignedTo,
          due_date: format(formData.nextActionDate, "yyyy-MM-dd"),
          due_time: formData.nextActionTime,
          lead_id: newLead.id,
          created_by: "Current User",
        });
      }

      setAddLeadDialogOpen(false);
    } catch (error) {
      console.error("Failed to add lead:", error);
    }
  };

  const handleEditLead = (lead: any) => {
    console.log("Edit lead:", lead);
  };

  const handleBulkUploadComplete = () => {
    refetch();
    toast({ title: "Leads imported successfully" });
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-marble-primary mb-1">Leads</h1>
            <p className="text-muted-foreground">
              Manage and track all your sales leads
            </p>
          </div>
          {canCreate("leads") && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setBulkUploadDialogOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Bulk Upload
              </Button>
              <Button onClick={() => setAddLeadDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add New Lead
              </Button>
            </div>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Lead Management</CardTitle>
            <CardDescription>
              View, filter, and manage all leads with advanced filtering and export capabilities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EnhancedLeadTable onEditLead={handleEditLead} />
          </CardContent>
        </Card>

        <SmartLeadForm
          open={addLeadDialogOpen}
          onOpenChange={setAddLeadDialogOpen}
          onSave={handleAddLead}
        />

        <BulkUploadDialog
          open={bulkUploadDialogOpen}
          onOpenChange={setBulkUploadDialogOpen}
          onLeadsCreated={handleBulkUploadComplete}
        />
      </div>
    </DashboardLayout>
  );
};

export default Leads;
