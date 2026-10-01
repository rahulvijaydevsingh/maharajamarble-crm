import React from "react";
import { UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CustomerDetailsSectionProps {
  profession: string;
  onProfessionChange: (value: string) => void;
}

export function CustomerDetailsSection({
  profession,
  onProfessionChange,
}: CustomerDetailsSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserRound className="h-5 w-5 text-primary" />
          Customer Details
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="customer-profession">Profession</Label>
          <Input
            id="customer-profession"
            value={profession}
            onChange={(event) =>
              onProfessionChange(event.target.value.slice(0, 100))
            }
            maxLength={100}
            placeholder="Optional"
            className="min-h-11"
          />
        </div>
      </CardContent>
    </Card>
  );
}
