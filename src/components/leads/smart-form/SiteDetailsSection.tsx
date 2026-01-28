
import React, { useState, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, Package, AlertCircle, X, Camera, Upload, Loader2 } from "lucide-react";
import { ConstructionStage } from "@/types/lead";
import { CONSTRUCTION_STAGES, MATERIAL_INTERESTS } from "@/constants/leadConstants";
import { extractGPSFromExif, coordinatesToPlusCode } from "@/lib/plusCode";

interface SiteDetailsSectionProps {
  siteLocation: string;
  sitePhotoUrl: string | null;
  sitePlusCode: string | null;
  constructionStage: ConstructionStage;
  estimatedQuantity: number | null;
  materialInterests: string[];
  otherMaterial: string;
  onSiteLocationChange: (location: string) => void;
  onSitePhotoChange: (photoUrl: string | null, plusCode: string | null) => void;
  onConstructionStageChange: (stage: ConstructionStage) => void;
  onEstimatedQuantityChange: (quantity: number | null) => void;
  onMaterialInterestsChange: (interests: string[]) => void;
  onOtherMaterialChange: (material: string) => void;
  validationErrors?: { [key: string]: string };
  hidePhotoUpload?: boolean;
}

export function SiteDetailsSection({
  siteLocation,
  sitePhotoUrl,
  sitePlusCode,
  constructionStage,
  estimatedQuantity,
  materialInterests,
  otherMaterial,
  onSiteLocationChange,
  onSitePhotoChange,
  onConstructionStageChange,
  onEstimatedQuantityChange,
  onMaterialInterestsChange,
  onOtherMaterialChange,
  validationErrors = {},
  hidePhotoUpload = false,
}: SiteDetailsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [gpsExtractionStatus, setGpsExtractionStatus] = useState<'idle' | 'extracting' | 'success' | 'no_gps'>('idle');
  // Normalize material interest value for comparison (lowercase, replace spaces with underscores)
  const normalizeMaterialValue = (value: string): string => {
    return value.toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, '');
  };

  // Check if a material is selected (case-insensitive, handles both value and label formats)
  const isMaterialSelected = (materialValue: string): boolean => {
    const normalizedTarget = normalizeMaterialValue(materialValue);
    return materialInterests.some(m => {
      const normalizedM = normalizeMaterialValue(m);
      // Check if matches value directly
      if (normalizedM === normalizedTarget) return true;
      // Check if the label matches (e.g., "Tiles" matches "tiles")
      const material = MATERIAL_INTERESTS.find(mi => normalizeMaterialValue(mi.value) === normalizedTarget);
      if (material && normalizeMaterialValue(material.label) === normalizedM) return true;
      return false;
    });
  };

  const hasOtherMaterial = materialInterests.includes("other") || 
    materialInterests.some(m => {
      const normalizedM = normalizeMaterialValue(m);
      return !MATERIAL_INTERESTS.some(mi => 
        normalizeMaterialValue(mi.value) === normalizedM || 
        normalizeMaterialValue(mi.label) === normalizedM
      ) && normalizedM !== 'other';
    });

  const handleMaterialToggle = (materialValue: string) => {
    const normalizedTarget = normalizeMaterialValue(materialValue);
    const isCurrentlySelected = isMaterialSelected(materialValue);
    
    if (isCurrentlySelected) {
      // Remove by filtering out both value and label matches
      onMaterialInterestsChange(materialInterests.filter(m => {
        const normalizedM = normalizeMaterialValue(m);
        if (normalizedM === normalizedTarget) return false;
        const material = MATERIAL_INTERESTS.find(mi => normalizeMaterialValue(mi.value) === normalizedTarget);
        if (material && normalizeMaterialValue(material.label) === normalizedM) return false;
        return true;
      }));
      if (materialValue === "other") {
        onOtherMaterialChange("");
      }
    } else {
      // Add the canonical value (not label)
      onMaterialInterestsChange([...materialInterests, materialValue]);
    }
  };

  const handleSelectAllMaterials = () => {
    const allValues = MATERIAL_INTERESTS.map(m => m.value);
    onMaterialInterestsChange([...allValues, "other"]);
  };

  const handleClearAllMaterials = () => {
    onMaterialInterestsChange([]);
    onOtherMaterialChange("");
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setGpsExtractionStatus('extracting');

    try {
      // Create preview URL
      const photoUrl = URL.createObjectURL(file);
      
      // Extract GPS coordinates from EXIF data
      const gpsData = await extractGPSFromExif(file);
      
      let plusCode: string | null = null;
      
      if (gpsData) {
        // Convert GPS coordinates to Plus Code
        try {
          plusCode = coordinatesToPlusCode(gpsData.latitude, gpsData.longitude);
          setGpsExtractionStatus('success');
          console.log(`GPS extracted: ${gpsData.latitude}, ${gpsData.longitude} -> Plus Code: ${plusCode}`);
        } catch (error) {
          console.error("Error converting to plus code:", error);
          setGpsExtractionStatus('no_gps');
        }
      } else {
        setGpsExtractionStatus('no_gps');
        console.log("No GPS data found in image");
      }
      
      onSitePhotoChange(photoUrl, plusCode);
    } catch (error) {
      console.error("Error uploading photo:", error);
      setGpsExtractionStatus('no_gps');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemovePhoto = () => {
    onSitePhotoChange(null, null);
    setGpsExtractionStatus('idle');
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const getStageUrgencyBadge = (stage: ConstructionStage) => {
    const stageConfig = CONSTRUCTION_STAGES.find(s => s.value === stage);
    if (!stageConfig) return null;

    const colorMap = {
      high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      low: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    };

    return (
      <Badge className={colorMap[stageConfig.urgency as keyof typeof colorMap]}>
        {stageConfig.urgency === "high" ? "High Urgency" : stageConfig.urgency === "medium" ? "Medium Urgency" : "Long-term"}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          Group 2: Site Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Site Location */}
        <div className="space-y-2">
          <Label htmlFor="siteLocation" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Site Location *
          </Label>
          <Textarea
            id="siteLocation"
            value={siteLocation}
            onChange={(e) => onSiteLocationChange(e.target.value)}
            placeholder="Enter complete site address for delivery planning..."
            rows={2}
            className={validationErrors.siteLocation ? 'border-destructive' : ''}
          />
          {validationErrors.siteLocation && (
            <p className="text-sm text-destructive">{validationErrors.siteLocation}</p>
          )}
        </div>

        {/* Site Photo Upload */}
        {!hidePhotoUpload && (
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Site Photo
              <span className="text-xs text-muted-foreground">(GPS coordinates will be extracted from EXIF data)</span>
            </Label>
            
            {sitePhotoUrl ? (
              <div className="space-y-2">
                <div className="relative inline-block">
                  <img
                    src={sitePhotoUrl}
                    alt="Site photo"
                    className="w-32 h-32 object-cover rounded-lg border"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    onClick={handleRemovePhoto}
                    className="absolute -top-2 -right-2 h-6 w-6"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                {/* GPS Status */}
                <div className="flex items-center gap-2">
                  {gpsExtractionStatus === 'success' && sitePlusCode ? (
                    <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      📍 Plus Code: {sitePlusCode}
                    </Badge>
                  ) : gpsExtractionStatus === 'no_gps' ? (
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                      ⚠️ No GPS data found in image
                    </Badge>
                  ) : null}
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/50 transition-colors"
              >
                {isUploading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>Processing image...</span>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Click to upload site photo</span>
                    <span className="text-xs text-muted-foreground">GPS coordinates will be auto-extracted from EXIF</span>
                  </>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </div>
        )}

        {/* Construction Stage with Urgency */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="constructionStage" className="flex items-center gap-2">
              Construction Stage *
              {constructionStage && getStageUrgencyBadge(constructionStage)}
            </Label>
            <Select
              value={constructionStage}
              onValueChange={(value) => onConstructionStageChange(value as ConstructionStage)}
            >
              <SelectTrigger className={validationErrors.constructionStage ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select construction stage" />
              </SelectTrigger>
              <SelectContent>
                {CONSTRUCTION_STAGES.map((stage) => (
                  <SelectItem key={stage.value} value={stage.value}>
                    <div className="flex items-center gap-2">
                      {stage.label}
                      {stage.urgency === "high" && (
                        <AlertCircle className="h-3 w-3 text-red-500" />
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {validationErrors.constructionStage && (
              <p className="text-sm text-destructive">{validationErrors.constructionStage}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="estimatedQuantity">Estimated Quantity (sq. ft.)</Label>
            <Input
              id="estimatedQuantity"
              type="number"
              value={estimatedQuantity || ""}
              onChange={(e) => onEstimatedQuantityChange(e.target.value ? parseInt(e.target.value) : null)}
              placeholder="e.g., 500"
              min={0}
            />
            <p className="text-xs text-muted-foreground">Optional - helps calculate potential deal value</p>
          </div>
        </div>

        {/* Material Interests */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Material Interests *
            </Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSelectAllMaterials}
                className="text-xs text-primary hover:underline"
              >
                Select All
              </button>
              <span className="text-xs text-muted-foreground">|</span>
              <button
                type="button"
                onClick={handleClearAllMaterials}
                className="text-xs text-muted-foreground hover:underline"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {MATERIAL_INTERESTS.map((material) => (
              <div key={material.value} className="flex items-center space-x-2">
                <Checkbox
                  id={material.value}
                  checked={isMaterialSelected(material.value)}
                  onCheckedChange={() => handleMaterialToggle(material.value)}
                />
                <Label
                  htmlFor={material.value}
                  className="text-sm font-normal cursor-pointer"
                >
                  {material.label}
                </Label>
              </div>
            ))}
            {/* Other checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="other_material"
                checked={hasOtherMaterial}
                onCheckedChange={() => handleMaterialToggle("other")}
              />
              <Label
                htmlFor="other_material"
                className="text-sm font-normal cursor-pointer"
              >
                Other
              </Label>
            </div>
          </div>

          {/* Other Material Text Input */}
          {hasOtherMaterial && (
            <div className="space-y-2">
              <Label htmlFor="otherMaterial">Specify Other Material *</Label>
              <Input
                id="otherMaterial"
                value={otherMaterial}
                onChange={(e) => onOtherMaterialChange(e.target.value)}
                placeholder="Enter material name..."
                className={validationErrors.otherMaterial ? 'border-destructive' : ''}
              />
              {validationErrors.otherMaterial && (
                <p className="text-sm text-destructive">{validationErrors.otherMaterial}</p>
              )}
            </div>
          )}

          {materialInterests.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2">
              {materialInterests.filter(m => m !== "other").map((interest) => {
                const material = MATERIAL_INTERESTS.find(m => m.value === interest);
                return (
                  <Badge key={interest} variant="secondary" className="gap-1">
                    {material?.label || interest}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => handleMaterialToggle(interest)}
                    />
                  </Badge>
                );
              })}
              {hasOtherMaterial && otherMaterial && (
                <Badge variant="secondary" className="gap-1">
                  {otherMaterial}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => handleMaterialToggle("other")}
                  />
                </Badge>
              )}
            </div>
          )}

          {validationErrors.materialInterests && (
            <p className="text-sm text-destructive">{validationErrors.materialInterests}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
