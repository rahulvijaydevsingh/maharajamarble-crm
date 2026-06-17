
import React, { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";

interface CreateQuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadData: any;
  onCreateQuotation: (quotationData: any) => void;
}

const MATERIALS = [
  "Granite",
  "Marble", 
  "Quartz",
  "Quartzite",
  "Limestone",
  "Sandstone"
];

const QUOTATION_TYPES = [
  "Kitchen Countertops",
  "Bathroom Vanity",
  "Flooring",
  "Stairs",
  "Wall Cladding",
  "Custom Work"
];

export function CreateQuotationDialog({ open, onOpenChange, leadData, onCreateQuotation }: CreateQuotationDialogProps) {
  const [formData, setFormData] = useState({
    quotationType: "",
    material: "",
    quantity: "",
    unit: "sq ft",
    pricePerUnit: "",
    totalAmount: "",
    validityDays: "30",
    notes: "",
    installationIncluded: true,
    transportationIncluded: true
  });
  
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Auto-calculate total amount
    if (name === "quantity" || name === "pricePerUnit") {
      const quantity = name === "quantity" ? parseFloat(value) || 0 : parseFloat(formData.quantity) || 0;
      const pricePerUnit = name === "pricePerUnit" ? parseFloat(value) || 0 : parseFloat(formData.pricePerUnit) || 0;
      const total = quantity * pricePerUnit;
      setFormData(prev => ({ ...prev, totalAmount: total.toFixed(2) }));
    }
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const quotationData = {
      id: `QUO-${Date.now()}`,
      leadId: leadData.id,
      leadName: leadData.name,
      customerPhone: leadData.phone,
      customerEmail: leadData.email,
      customerAddress: leadData.address,
      quotationType: formData.quotationType,
      material: formData.material,
      quantity: parseFloat(formData.quantity),
      unit: formData.unit,
      pricePerUnit: parseFloat(formData.pricePerUnit),
      totalAmount: parseFloat(formData.totalAmount),
      validityDays: parseInt(formData.validityDays),
      notes: formData.notes,
      installationIncluded: formData.installationIncluded,
      transportationIncluded: formData.transportationIncluded,
      status: "Draft",
      createdAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + parseInt(formData.validityDays) * 24 * 60 * 60 * 1000).toISOString()
    };
    
    console.log("Creating quotation:", quotationData);
    onCreateQuotation(quotationData);
    
    toast({
      title: "Quotation Created",
      description: `Quotation ${quotationData.id} has been created for ${leadData.name}.`,
    });
    
    // Reset form
    setFormData({
      quotationType: "",
      material: "",
      quantity: "",
      unit: "sq ft",
      pricePerUnit: "",
      totalAmount: "",
      validityDays: "30",
      notes: "",
      installationIncluded: true,
      transportationIncluded: true
    });
    
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Quotation</DialogTitle>
            <DialogDescription>
              Create a quotation for {leadData.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quotationType">Quotation Type *</Label>
                <Select value={formData.quotationType} onValueChange={(value) => handleSelectChange("quotationType", value)} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {QUOTATION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="material">Material *</Label>
                <Select value={formData.material} onValueChange={(value) => handleSelectChange("material", value)} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select material" />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIALS.map((material) => (
                      <SelectItem key={material} value={material}>{material}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  step="0.01"
                  value={formData.quantity}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Select value={formData.unit} onValueChange={(value) => handleSelectChange("unit", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sq ft">Square Feet</SelectItem>
                    <SelectItem value="sq m">Square Meter</SelectItem>
                    <SelectItem value="linear ft">Linear Feet</SelectItem>
                    <SelectItem value="piece">Piece</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pricePerUnit">Price per {formData.unit} *</Label>
                <Input
                  id="pricePerUnit"
                  name="pricePerUnit"
                  type="number"
                  step="0.01"
                  value={formData.pricePerUnit}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="totalAmount">Total Amount (₹)</Label>
                <Input
                  id="totalAmount"
                  name="totalAmount"
                  type="number"
                  step="0.01"
                  value={formData.totalAmount}
                  onChange={handleInputChange}
                  className="bg-gray-50"
                  readOnly
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="validityDays">Validity (Days)</Label>
                <Input
                  id="validityDays"
                  name="validityDays"
                  type="number"
                  value={formData.validityDays}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes/Terms</Label>
              <Textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                placeholder="Additional terms, conditions, or notes..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Inclusions</Label>
              <div className="flex gap-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.installationIncluded}
                    onChange={(e) => setFormData(prev => ({ ...prev, installationIncluded: e.target.checked }))}
                  />
                  <span className="text-sm">Installation Included</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.transportationIncluded}
                    onChange={(e) => setFormData(prev => ({ ...prev, transportationIncluded: e.target.checked }))}
                  />
                  <span className="text-sm">Transportation Included</span>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Create Quotation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
