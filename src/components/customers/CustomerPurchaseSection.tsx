import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Package } from "lucide-react";
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
  id,
  label,
  values,
  options,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  values: string[];
  options: { value: string; label: string }[];
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleMouseClose = (pointerType: string) => {
    if (pointerType !== "mouse") {
      return;
    }

    cancelCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const selectedLabels = values.map(
    (value) => options.find((option) => option.value === value)?.label || value,
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <DropdownMenu
        open={open}
        onOpenChange={(nextOpen) => {
          cancelCloseTimer();
          setOpen(nextOpen);
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className="min-h-11 h-auto w-full justify-between gap-2 text-left font-normal"
            onPointerEnter={cancelCloseTimer}
            onPointerLeave={(event) => scheduleMouseClose(event.pointerType)}
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
          className="w-[min(22rem,calc(100vw-2rem))] p-0"
          onPointerEnter={cancelCloseTimer}
          onPointerLeave={(event) => scheduleMouseClose(event.pointerType)}
        >
          <DropdownMenuLabel className="px-3 py-3">{label}</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <div className="max-h-[min(50vh,20rem)] overflow-y-auto">
            {options.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={values.includes(option.value)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) => {
                  onChange(
                    checked
                      ? [...values, option.value]
                      : values.filter((value) => value !== option.value),
                  );
                }}
                className="min-h-11 py-2 pl-3 pr-3"
              >
                <Check className="mr-2 h-4 w-4 shrink-0 opacity-0 data-[state=checked]:opacity-100" />
                <span>{option.label}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </div>

          <DropdownMenuSeparator />
          <div className="p-2">
            <Button
              type="button"
              className="min-h-11 w-full"
              onClick={() => {
                cancelCloseTimer();
                setOpen(false);
              }}
            >
              Done
            </Button>
          </div>
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
  const quantityUnits = QUOTATION_UNITS.filter((unit) =>
    new Set(["sqft", "sqm", "rft", "pcs"]).has(unit.value),
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
          id="customer-materials-purchased"
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
              className="min-h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer-quantity-unit">Unit</Label>
            <Select value={quantityUnit} onValueChange={onQuantityUnitChange}>
              <SelectTrigger id="customer-quantity-unit" className="min-h-11">
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
            onChange={(event) =>
              onBillNumberChange(event.target.value.slice(0, 50))
            }
            maxLength={50}
            placeholder="Optional"
            className="min-h-11"
          />
        </div>

        <MultiSelectField
          id="customer-pending-followup"
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
