import React from "react";
import { UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useControlPanelSettings } from "@/hooks/useControlPanelSettings";

interface CustomerDetailsSectionProps {
  customerType: string;
  priority: string;
  profession: string;
  onCustomerTypeChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onProfessionChange: (value: string) => void;
}

export function CustomerDetailsSection({
  customerType,
  priority,
  profession,
  onCustomerTypeChange,
  onPriorityChange,
  onProfessionChange,
}: CustomerDetailsSectionProps) {
  const { getFieldOptions } = useControlPanelSettings();
  const customerTypeOptions = getFieldOptions("customers", "customer_type");
  const priorityOptions = getFieldOptions("customers", "priority");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserRound className="h-5 w-5 text-primary" />
          Customer Details
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Customer Type</Label>
          <Select value={customerType} onValueChange={onCustomerTypeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select customer type" />
            </SelectTrigger>
            <SelectContent>
              {customerTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={onPriorityChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select priority" />
            </SelectTrigger>
            <SelectContent>
              {priorityOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="customer-profession">Profession</Label>
          <Input
            id="customer-profession"
            value={profession}
            onChange={(event) => onProfessionChange(event.target.value.slice(0, 100))}
            maxLength={100}
            placeholder="Optional"
          />
        </div>
      </CardContent>
    </Card>
  );
}
