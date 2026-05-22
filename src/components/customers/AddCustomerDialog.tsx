import React, { useMemo, useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCustomers, Customer, CustomerInsert } from "@/hooks/useCustomers";
import {
  CUSTOMER_TYPES as FALLBACK_CUSTOMER_TYPES,
  INDUSTRIES as FALLBACK_INDUSTRIES,
  CUSTOMER_SOURCES as FALLBACK_CUSTOMER_SOURCES,
  CITIES as FALLBACK_CITIES,
  PRIORITY_LEVELS as FALLBACK_PRIORITY_LEVELS,
} from "@/constants/customerConstants";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { useAuth } from "@/contexts/AuthContext";
import { buildStaffGroups } from "@/lib/staffSelect";
import { useControlPanelSettings } from "@/hooks/useControlPanelSettings";
import { useTasks } from "@/hooks/useTasks";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const localDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCustomer?: Customer | null;
}

export function AddCustomerDialog({ open, onOpenChange, editingCustomer }: AddCustomerDialogProps) {
  const { addCustomer, updateCustomer } = useCustomers();
  const { addTask } = useTasks();
  const { staffMembers, loading: staffLoading } = useActiveStaff();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { getFieldOptions } = useControlPanelSettings();

  const staffGroups = useMemo(() => buildStaffGroups(staffMembers), [staffMembers]);

  // Use control panel options, fallback to constants
  const CUSTOMER_TYPES = useMemo(() => {
    const cpOptions = getFieldOptions("customers", "customer_type");
    if (cpOptions.length > 0) return cpOptions.map(o => ({ value: o.value, label: o.label }));
    return FALLBACK_CUSTOMER_TYPES;
  }, [getFieldOptions]);

  const INDUSTRIES = useMemo(() => {
    const cpOptions = getFieldOptions("customers", "industry");
    if (cpOptions.length > 0) return cpOptions.map(o => ({ value: o.value, label: o.label }));
    return FALLBACK_INDUSTRIES;
  }, [getFieldOptions]);

  const CUSTOMER_SOURCES = useMemo(() => {
    const cpOptions = getFieldOptions("customers", "customer_source");
    if (cpOptions.length > 0) return cpOptions.map(o => ({ value: o.value, label: o.label }));
    return FALLBACK_CUSTOMER_SOURCES;
  }, [getFieldOptions]);

  const CITIES = useMemo(() => {
    const cpOptions = getFieldOptions("customers", "city");
    if (cpOptions.length > 0) return cpOptions.map(o => ({ value: o.value, label: o.label }));
    return FALLBACK_CITIES;
  }, [getFieldOptions]);

  const PRIORITY_LEVELS = useMemo(() => {
    const cpOptions = getFieldOptions("customers", "priority");
    if (cpOptions.length > 0) {
      const map: Record<string, { label: string; color: string }> = {};
      cpOptions.forEach(o => { map[o.value] = { label: o.label, color: o.color ? `text-[${o.color}]` : "text-foreground" }; });
      return map;
    }
    return FALLBACK_PRIORITY_LEVELS;
  }, [getFieldOptions]);

  const getDefaultAssignedTo = () => {
    const currentUserName = staffMembers.find(m => m.id === user?.id)?.name;
    if (currentUserName) return currentUserName;
    return staffMembers[0]?.name || "";
  };

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    alternate_phone: "",
    email: "",
    company_name: "",
    address: "",
    city: "",
    customer_type: "individual",
    industry: "",
    status: "active",
    priority: 3,
    source: "direct",
    notes: "",
    assigned_to: "",
  });

  const [createFollowUp, setCreateFollowUp] = useState(false);
  const [followUpData, setFollowUpData] = useState({
    title: "",
    type: "Follow-up Call",
    dueDate: new Date(),
    dueTime: "10:00",
    reminder: false,
  });

  useEffect(() => {
    if (editingCustomer) {
      setFormData({
        name: editingCustomer.name,
        phone: editingCustomer.phone,
        alternate_phone: editingCustomer.alternate_phone || "",
        email: editingCustomer.email || "",
        company_name: editingCustomer.company_name || "",
        address: editingCustomer.address || "",
        city: editingCustomer.city || "",
        customer_type: editingCustomer.customer_type,
        industry: editingCustomer.industry || "",
        status: editingCustomer.status,
        priority: editingCustomer.priority,
        source: editingCustomer.source || "direct",
        notes: editingCustomer.notes || "",
        assigned_to: editingCustomer.assigned_to,
      });
    } else {
      resetForm();
    }
  }, [editingCustomer, open, staffMembers]);

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      alternate_phone: "",
      email: "",
      company_name: "",
      address: "",
      city: "",
      customer_type: "individual",
      industry: "",
      status: "active",
      priority: 3,
      source: "direct",
      notes: "",
      assigned_to: getDefaultAssignedTo(),
    });
    setCreateFollowUp(false);
    setFollowUpData({
      title: "",
      type: "Follow-up Call",
      dueDate: new Date(),
      dueTime: "10:00",
      reminder: false,
    });
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.phone.trim()) return;

    setIsSubmitting(true);
    try {
      const data: CustomerInsert = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        alternate_phone: formData.alternate_phone.trim() || null,
        email: formData.email.trim() || null,
        company_name: formData.company_name.trim() || null,
        address: formData.address.trim() || null,
        city: formData.city || null,
        customer_type: formData.customer_type,
        industry: formData.industry || null,
        status: formData.status,
        priority: formData.priority,
        source: formData.source,
        notes: formData.notes.trim() || null,
        assigned_to: formData.assigned_to,
        // created_by handled by DB default get_current_user_email()
      };

      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, data);
        onOpenChange(false);
        resetForm();
      } else {
        const newCustomer = await addCustomer(data);
        if (createFollowUp && newCustomer?.id && followUpData.title.trim()) {
          try {
            await addTask({
              title: followUpData.title.trim(),
              type: followUpData.type,
              assigned_to: formData.assigned_to,
              priority: "Medium",
              due_date: localDate(followUpData.dueDate),
              due_time: followUpData.dueTime,
              status: "Pending",
              reminder: followUpData.reminder,
              reminder_time: followUpData.reminder ? "60" : null,
              related_entity_type: "customer",
              related_entity_id: newCustomer.id,
              description: null,
              lead_id: null,
            });
          } catch (e) {
            console.warn("Follow-up task creation failed", e);
          }
        }
        onOpenChange(false);
        resetForm();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingCustomer ? "Edit Customer" : "Add New Customer"}</DialogTitle>
          <DialogDescription>
            {editingCustomer ? "Update customer information." : "Add a new customer to your database."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Full name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input id="company_name" value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} placeholder="Company name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+91 98765 43210" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="alternate_phone">Alternate Phone</Label>
              <Input id="alternate_phone" value={formData.alternate_phone} onChange={(e) => setFormData({ ...formData, alternate_phone: e.target.value })} placeholder="+91 98765 43210" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="email@example.com" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer_type">Customer Type *</Label>
              <Select value={formData.customer_type} onValueChange={(v) => setFormData({ ...formData, customer_type: v })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {CUSTOMER_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Select value={formData.industry} onValueChange={(v) => setFormData({ ...formData, industry: v })}>
                <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind.value} value={ind.value}>{ind.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Select value={formData.city} onValueChange={(v) => setFormData({ ...formData, city: v })}>
                <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>
                  {CITIES.map((city) => (
                    <SelectItem key={city.value} value={city.value}>{city.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Select value={formData.source} onValueChange={(v) => setFormData({ ...formData, source: v })}>
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {CUSTOMER_SOURCES.map((src) => (
                    <SelectItem key={src.value} value={src.value}>{src.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={formData.priority.toString()} onValueChange={(v) => setFormData({ ...formData, priority: parseInt(v) })}>
                <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LEVELS).map(([value, { label }]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assigned_to">Assigned To</Label>
              <Select value={formData.assigned_to} onValueChange={(v) => setFormData({ ...formData, assigned_to: v })}>
                <SelectTrigger><SelectValue placeholder={staffLoading ? "Loading..." : "Select assignee"} /></SelectTrigger>
                <SelectContent>
                  {staffGroups.map((group, idx) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel className="text-xs text-muted-foreground">{group.label}</SelectLabel>
                      {group.members.map((member) => (
                        <SelectItem key={member.id} value={member.name}>
                          <span className="truncate">{member._display}</span>
                        </SelectItem>
                      ))}
                      {idx < staffGroups.length - 1 && <SelectSeparator />}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Full address" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional notes about this customer..." rows={3} />
          </div>

          {!editingCustomer && (
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="createFollowUp"
                  checked={createFollowUp}
                  onCheckedChange={(v) => {
                    setCreateFollowUp(!!v);
                    if (!!v && !followUpData.title) {
                      setFollowUpData(prev => ({ ...prev, title: `Follow-up: ${formData.name}` }));
                    }
                  }}
                />
                <Label htmlFor="createFollowUp" className="text-sm cursor-pointer font-medium">
                  Create initial follow-up task
                </Label>
              </div>

              {createFollowUp && (
                <div className="space-y-3 pl-6 border-l-2 border-border">
                  <div className="space-y-1">
                    <Label className="text-xs">Task Title *</Label>
                    <Input
                      value={followUpData.title}
                      onChange={(e) => setFollowUpData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Follow-up task title"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Task Type</Label>
                      <Select value={followUpData.type} onValueChange={(v) => setFollowUpData(prev => ({ ...prev, type: v }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Follow-up Call">Follow-up Call</SelectItem>
                          <SelectItem value="Meeting">Meeting</SelectItem>
                          <SelectItem value="Site Visit">Site Visit</SelectItem>
                          <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Due Date</Label>
                      <Input
                        type="date"
                        value={localDate(followUpData.dueDate)}
                        min={localDate(new Date())}
                        onChange={(e) => setFollowUpData(prev => ({ ...prev, dueDate: new Date(e.target.value) }))}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Due Time</Label>
                    <div className="flex gap-2">
                      {(["Morning", "Afternoon", "Evening"] as const).map((zone) => (
                        <Button
                          key={zone}
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn("flex-1 text-xs h-8", {
                            "bg-primary text-primary-foreground hover:bg-primary/90":
                              (zone === "Morning" && followUpData.dueTime >= "08:00" && followUpData.dueTime <= "11:59") ||
                              (zone === "Afternoon" && followUpData.dueTime >= "12:00" && followUpData.dueTime <= "16:59") ||
                              (zone === "Evening" && followUpData.dueTime >= "17:00" && followUpData.dueTime <= "20:00"),
                          })}
                          onClick={() => setFollowUpData(prev => ({ ...prev, dueTime: zone === "Morning" ? "10:00" : zone === "Afternoon" ? "14:00" : "17:00" }))}
                        >
                          {zone}
                        </Button>
                      ))}
                    </div>
                    <div className="mt-2">
                      <Input
                        type="time"
                        value={followUpData.dueTime}
                        onChange={(e) => setFollowUpData(prev => ({ ...prev, dueTime: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="taskReminder"
                      checked={followUpData.reminder}
                      onCheckedChange={(v) => setFollowUpData(prev => ({ ...prev, reminder: !!v }))}
                    />
                    <Label htmlFor="taskReminder" className="text-xs cursor-pointer">Set reminder (1 hour before)</Label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !formData.name.trim() || !formData.phone.trim()}>
            {isSubmitting ? "Saving..." : editingCustomer ? "Update Customer" : "Add Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
