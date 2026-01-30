
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface UnifiedLeadFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  leadData?: any; // Full lead data for edit mode
  onSave: (formData: any) => void;
}

const LEAD_SOURCES = [
  "Website", "Social Media", "Referral", "Advertisement", 
  "Exhibition", "Cold Call", "Email Campaign", "Other"
];

const MATERIAL_INTERESTS = [
  "Marble Flooring", "Granite", "Kitchen Countertops", "Quartz",
  "Granite Stairs", "Bathroom Tiles", "Wall Cladding", "Custom Design"
];

const LEAD_STATUSES = [
  { value: "new", label: "New" },
  { value: "in-progress", label: "In Progress" },
  { value: "quoted", label: "Quoted" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "on-hold", label: "On Hold" }
];

const PRIORITIES = [
  { value: 1, label: "Very High" },
  { value: 2, label: "High" },
  { value: 3, label: "Medium" },
  { value: 4, label: "Low" },
  { value: 5, label: "Very Low" }
];

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  sales_user: "Sales",
  sales_viewer: "Viewer",
  field_agent: "Field Agent",
};

export function UnifiedLeadForm({ open, onOpenChange, mode, leadData, onSave }: UnifiedLeadFormProps) {
  const { staffMembers } = useActiveStaff();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    phone2: "",
    phone3: "",
    phone4: "",
    email: "",
    address: "",
    source: "",
    customSource: "",
    interests: [] as string[],
    status: "new",
    assignedTo: "",
    priority: 3,
    notes: "",
    nextFollowUp: new Date(),
    lastContact: mode === "edit" ? new Date() : undefined
  });

  const { toast } = useToast();

  // Pre-fill form data when in edit mode
  useEffect(() => {
    if (mode === "edit" && leadData) {
      setFormData({
        name: leadData.name || "",
        phone: leadData.phone || "",
        phone2: leadData.phone2 || "",
        phone3: leadData.phone3 || "",
        phone4: leadData.phone4 || "",
        email: leadData.email || "",
        address: leadData.address || "",
        source: leadData.source || "",
        customSource: "",
        interests: leadData.interest || [],
        status: leadData.status?.value || "new",
        assignedTo: leadData.assignedTo || "",
        priority: leadData.priority || 3,
        notes: leadData.notes || "",
        nextFollowUp: leadData.nextFollowUp ? new Date(leadData.nextFollowUp) : new Date(),
        lastContact: leadData.lastContact ? new Date(leadData.lastContact) : new Date()
      });
    } else if (mode === "add") {
      // Reset form for add mode
      const currentUserId = user?.id;
      const defaultAssignee = currentUserId && staffMembers.some(m => m.id === currentUserId)
        ? currentUserId
        : (staffMembers[0]?.id || "");

      setFormData({
        name: "",
        phone: "",
        phone2: "",
        phone3: "",
        phone4: "",
        email: "",
        address: "",
        source: "",
        customSource: "",
        interests: [],
        status: "new",
        assignedTo: defaultAssignee,
        priority: 3,
        notes: "",
        nextFollowUp: new Date(),
        lastContact: undefined
      });
    }
  }, [mode, leadData, open, staffMembers, user?.id]);

  // If edit-mode lead stores a name, map it to staff id so the select doesn't "lose" the value.
  useEffect(() => {
    if (!open) return;
    if (!formData.assignedTo) return;
    if (staffMembers.some(m => m.id === formData.assignedTo)) return;

    const match = staffMembers.find(m => m.name === formData.assignedTo);
    if (match) {
      setFormData(prev => ({ ...prev, assignedTo: match.id }));
    }
  }, [open, formData.assignedTo, staffMembers]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleInterestToggle = (interest: string) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest]
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.phone.trim()) {
      toast({
        title: "Error",
        description: "Phone number is required.",
        variant: "destructive",
      });
      return;
    }

    if (formData.interests.length === 0) {
      toast({
        title: "Error",
        description: "At least one material interest is required.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.assignedTo) {
      toast({
        title: "Error",
        description: "Please assign the lead to a team member.",
        variant: "destructive",
      });
      return;
    }

    console.log(`${mode === "add" ? "Creating" : "Updating"} lead:`, formData);
    onSave(formData);
    
    toast({
      title: mode === "add" ? "Lead Created" : "Lead Updated",
      description: `Lead ${formData.name} has been successfully ${mode === "add" ? "created" : "updated"}.`,
    });
    
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "add" ? "Add New Lead" : "Edit Lead Details"}</DialogTitle>
            <DialogDescription>
              {mode === "add" 
                ? "Fill in the details to create a new lead." 
                : "Update the lead information. All changes will be logged in the history."
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Basic Information</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleInputChange("name", e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Primary Phone *</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone2">Secondary Phone</Label>
                  <Input
                    id="phone2"
                    value={formData.phone2}
                    onChange={(e) => handleInputChange("phone2", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => handleInputChange("address", e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            {/* Lead Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Lead Details</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="source">Lead Source *</Label>
                  <Select value={formData.source} onValueChange={(value) => handleInputChange("source", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_SOURCES.map((source) => (
                        <SelectItem key={source} value={source}>{source}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value) => handleInputChange("status", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="assignedTo">Assigned To *</Label>
                  <Select value={formData.assignedTo} onValueChange={(value) => handleInputChange("assignedTo", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          <div className="flex items-center justify-between gap-3 w-full">
                            <span className="truncate">{member.name}</span>
                            {member.role && (
                              <span className="text-xs text-muted-foreground shrink-0">
                                {roleLabels[member.role] || member.role}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                      {formData.assignedTo && !staffMembers.find(m => m.id === formData.assignedTo) && (
                        <SelectItem key={formData.assignedTo} value={formData.assignedTo}>
                          {formData.assignedTo}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select value={formData.priority.toString()} onValueChange={(value) => handleInputChange("priority", parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((priority) => (
                        <SelectItem key={priority.value} value={priority.value.toString()}>{priority.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Material Interests *</Label>
                <div className="flex flex-wrap gap-2">
                  {MATERIAL_INTERESTS.map((material) => (
                    <div key={material} className="flex items-center space-x-2">
                      <Checkbox
                        id={material}
                        checked={formData.interests.includes(material)}
                        onCheckedChange={() => handleInterestToggle(material)}
                      />
                      <Label htmlFor={material} className="text-sm font-normal">{material}</Label>
                    </div>
                  ))}
                </div>
                {formData.interests.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formData.interests.map((interest) => (
                      <Badge key={interest} variant="secondary" className="gap-1">
                        {interest}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => handleInterestToggle(interest)}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="nextFollowUp">Next Follow Up Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.nextFollowUp && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.nextFollowUp ? format(formData.nextFollowUp, "PPP") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.nextFollowUp}
                      onSelect={(date) => date && handleInputChange("nextFollowUp", date)}
                      disabled={(date) => date < new Date()}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleInputChange("notes", e.target.value)}
                  rows={3}
                  placeholder="Any additional notes about the lead..."
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {mode === "add" ? "Create Lead" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
