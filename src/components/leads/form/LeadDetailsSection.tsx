
import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadFormData } from "@/types/lead";
import { MATERIALS } from "@/constants/leadConstants";
import { useActiveStaff } from "@/hooks/useActiveStaff";

interface LeadDetailsSectionProps {
  formData: LeadFormData;
  validationErrors: { [key: string]: string };
  showCustomSource: boolean;
  customSource: string;
  onSelectChange: (name: string, value: string) => void;
  onInterestChange: (material: string, checked: boolean) => void;
  onCustomSourceChange: (value: string) => void;
  onSelectAllInterests: () => void;
  onClearAllInterests: () => void;
}

export function LeadDetailsSection({
  formData,
  validationErrors,
  showCustomSource,
  customSource,
  onSelectChange,
  onInterestChange,
  onCustomSourceChange,
  onSelectAllInterests,
  onClearAllInterests
}: LeadDetailsSectionProps) {
  const { staffMembers, loading: staffLoading } = useActiveStaff();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Lead Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Source */}
        <div className="space-y-2">
          <Label htmlFor="source">Lead Source *</Label>
          <Select value={formData.source} onValueChange={(value) => onSelectChange("source", value)} required>
            <SelectTrigger className={validationErrors.source ? "border-red-500" : ""}>
              <SelectValue placeholder="Select source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="website">Website</SelectItem>
              <SelectItem value="referral">Referral</SelectItem>
              <SelectItem value="walk-in">Walk-in</SelectItem>
              <SelectItem value="exhibition">Exhibition</SelectItem>
              <SelectItem value="google">Google Search</SelectItem>
              <SelectItem value="social-media">Social Media</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          {validationErrors.source && (
            <p className="text-sm text-red-500">{validationErrors.source}</p>
          )}
        </div>

        {/* Custom Source */}
        {showCustomSource && (
          <div className="space-y-2">
            <Label htmlFor="customSource">Specify Lead Source *</Label>
            <Input
              id="customSource"
              value={customSource}
              onChange={(e) => onCustomSourceChange(e.target.value)}
              placeholder="Enter custom lead source"
              className={validationErrors.customSource ? "border-red-500" : ""}
            />
            {validationErrors.customSource && (
              <p className="text-sm text-red-500">{validationErrors.customSource}</p>
            )}
          </div>
        )}

        {/* Interests */}
        <div className="space-y-2">
          <Label>Materials of Interest *</Label>
          <div className="grid grid-cols-2 gap-2">
            {MATERIALS.map((material) => (
              <div key={material} className="flex items-center space-x-2">
                <Checkbox
                  id={material}
                  checked={formData.interests.includes(material)}
                  onCheckedChange={(checked) => onInterestChange(material, checked === true)}
                />
                <Label htmlFor={material} className="text-sm">{material}</Label>
              </div>
            ))}
          </div>
          <div className="flex space-x-2">
            <Button type="button" variant="outline" size="sm" onClick={onSelectAllInterests}>
              Select All
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClearAllInterests}>
              Clear All
            </Button>
          </div>
          {validationErrors.interests && (
            <p className="text-sm text-red-500">{validationErrors.interests}</p>
          )}
        </div>

        {/* Assignment */}
        <div className="space-y-2">
          <Label htmlFor="assignedTo">Assign To *</Label>
          <Select value={formData.assignedTo} onValueChange={(value) => onSelectChange("assignedTo", value)} required>
            <SelectTrigger className={validationErrors.assignedTo ? "border-red-500" : ""}>
              <SelectValue placeholder={staffLoading ? "Loading..." : "Select team member"} />
            </SelectTrigger>
            <SelectContent>
              {staffMembers.map((member) => (
                <SelectItem key={member.id} value={member.name}>{member.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {validationErrors.assignedTo && (
            <p className="text-sm text-red-500">{validationErrors.assignedTo}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}