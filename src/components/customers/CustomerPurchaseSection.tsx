import React from "react";
import { ChevronsUpDown, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useControlPanelSettings } from "@/hooks/useControlPanelSettings";
import { QUOTATION_UNITS } from "@/types/quotation";

interface CustomerPurchaseSectionProps {
  materialsPurchased: string[];
  quantityPurchased: number | null;
  quantityUnit: string;
  billNumber: string;
  pendingFollowups: string[];
  onMaterialsPurchasedChange: (values: string[]) => void;
  onQuantityPurchasedChange: (value: number | null) => void;
  onQuantityUnitChange: (value: string) => void;
  onBillNumberChange: (value: string) => void;
  onPendingFollowupsChange: (values: string[]) => void;
}

function MultiSelectField({
  label,
  values,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  options: { value: string; label: string }[];
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  const selectedLabels = values.map(
    (value) => options.find((option) => option.value === value)?.label || value,
  );

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="min-h-10 h-auto w-full justify-between gap-2 text-left font-normal"
          >
            <span className="flex min-w-0 flex-wrap gap-1">
              {selectedLabels.length > 0 ? (
                selectedLabels.map((value) => (
                  <Badge key={value} variant="secondary">
                    {value}
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[min(22rem,calc(100vw-2rem))]"
        >
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={values.includes(option.value)}
              onCheckedChange={(checked) => {
                onChange(
                  checked
                    ? [...values, option.value]
                    : values.filter((value) => value !== option.value),
                );
              }}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function CustomerPurchaseSection({
  materialsPurchased,
  quantityPurchased,
  quantityUnit,
  billNumber,
  pendingFollowups,
  onMaterialsPurchasedChange,
  onQuantityPurchasedChange,
  onQuantityUnitChange,
  onBillNumberChange,
  onPendingFollowupsChange,
}: CustomerPurchaseSectionProps) {
  const { getFieldOptions } = useControlPanelSettings();
  const materialOptions = getFieldOptions("materials", "materials");
  const pendingFollowupOptions = getFieldOptions(
    "customers",
    "pending_followup",
  );
  const allowedUnits = new Set(["sqft", "sqm", "rft", "pcs"]);
  const quantityUnits = QUOTATION_UNITS.filter((unit) =>
    allowedUnits.has(unit.value),
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Package className="h-5 w-5 text-primary" />
          Purchase Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <MultiSelectField
          label="Materials Purchased"
          values={materialsPurchased}
          options={materialOptions}
          placeholder="Select purchased materials"
          onChange={onMaterialsPurchasedChange}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <div className="space-y-2">
            <Label htmlFor="customer-quantity">Quantity Purchased</Label>
            <Input
              id="customer-quantity"
              type="number"
              min="0"
              step="0.01"
              value={quantityPurchased ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "") {
                  onQuantityPurchasedChange(null);
                  return;
                }

                const parsed = Number(value);
                onQuantityPurchasedChange(
                  Number.isFinite(parsed) ? Math.max(0, parsed) : null,
                );
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Unit</Label>
            <Select value={quantityUnit} onValueChange={onQuantityUnitChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {quantityUnits.map((unit) => (
                  <SelectItem key={unit.value} value={unit.value}>
                    {unit.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="customer-bill-number">Bill Number</Label>
          <Input
            id="customer-bill-number"
            value={billNumber}
            onChange={(event) => onBillNumberChange(event.target.value.slice(0, 50))}
            maxLength={50}
            placeholder="Optional"
          />
        </div>

        <MultiSelectField
          label="Pending Follow-up"
          values={pendingFollowups}
          options={pendingFollowupOptions}
          placeholder="Select pending follow-ups"
          onChange={onPendingFollowupsChange}
        />
      </CardContent>
    </Card>
  );
}
