import React, { useMemo } from "react";
import { MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface CustomerAddressSectionProps {
  address: string;
  sitePlusCode: string;
  onAddressChange: (value: string) => void;
  onSitePlusCodeChange: (value: string) => void;
  validationErrors?: Record<string, string>;
}

const OPEN_LOCATION_CODE_PATTERN =
  /^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,6}$/i;

export function isValidCustomerPlusCode(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || OPEN_LOCATION_CODE_PATTERN.test(trimmed.replace(/\s+/g, ""));
}

export function CustomerAddressSection({
  address,
  sitePlusCode,
  onAddressChange,
  onSitePlusCodeChange,
  validationErrors = {},
}: CustomerAddressSectionProps) {
  const plusCodeError = useMemo(() => {
    if (!sitePlusCode.trim()) {
      return "";
    }

    return isValidCustomerPlusCode(sitePlusCode)
      ? ""
      : "Enter a valid full or short Plus Code, or leave it blank.";
  }, [sitePlusCode]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="h-5 w-5 text-primary" />
          Customer Address
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="customer-address">
            Address <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="customer-address"
            value={address}
            onChange={(event) => onAddressChange(event.target.value)}
            placeholder="Enter customer address"
            rows={3}
            className={validationErrors.address ? "border-destructive" : ""}
          />
          {validationErrors.address && (
            <p className="text-sm text-destructive">{validationErrors.address}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="customer-plus-code">Location code</Label>
          <Input
            id="customer-plus-code"
            value={sitePlusCode}
            onChange={(event) => onSitePlusCodeChange(event.target.value)}
            placeholder="e.g. 8FVC9G8F+5W or 9G8F+5W"
            maxLength={20}
            aria-invalid={Boolean(plusCodeError || validationErrors.sitePlusCode)}
          />
          {(plusCodeError || validationErrors.sitePlusCode) && (
            <p className="text-sm text-destructive">
              {plusCodeError || validationErrors.sitePlusCode}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Optional. Full and short Open Location Code formats are accepted.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
