import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, MapPin, X } from "lucide-react";
import { extractGPSFromExif, coordinatesToPlusCode } from "@/lib/plusCode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface CustomerAddressSectionProps {
  address: string;
  sitePlusCode: string;
  open?: boolean;
  resetSignal?: number;
  onAddressChange: (value: string) => void;
  onSitePlusCodeChange: (value: string) => void;
  validationErrors?: Record<string, string>;
}

const OPEN_LOCATION_CODE_PATTERN =
  /^([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,6})(?:\s+[A-Za-z0-9][A-Za-z0-9 ,.-]*)?$/i;

export function isValidCustomerPlusCode(value: string): boolean {
  return !value.trim() || OPEN_LOCATION_CODE_PATTERN.test(value.trim());
}

export function CustomerAddressSection({
  address,
  sitePlusCode,
  open = true,
  resetSignal = 0,
  onAddressChange,
  onSitePlusCodeChange,
  validationErrors = {},
}: CustomerAddressSectionProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoStatus, setPhotoStatus] = useState<
    "idle" | "processing" | "success" | "no_gps"
  >("idle");
  const photoUrlRef = useRef<string | null>(null);
  const takePhotoInputRef = useRef<HTMLInputElement>(null);
  const choosePhotoInputRef = useRef<HTMLInputElement>(null);

  const revokePhotoUrl = useCallback(() => {
    if (photoUrlRef.current) {
      URL.revokeObjectURL(photoUrlRef.current);
      photoUrlRef.current = null;
    }
  }, []);

  const clearPhoto = useCallback(() => {
    revokePhotoUrl();
    setPhotoUrl(null);
    setPhotoStatus("idle");

    if (takePhotoInputRef.current) {
      takePhotoInputRef.current.value = "";
    }

    if (choosePhotoInputRef.current) {
      choosePhotoInputRef.current.value = "";
    }
  }, [revokePhotoUrl]);

  useEffect(() => {
    if (!open) {
      clearPhoto();
    }
  }, [clearPhoto, open]);

  useEffect(() => {
    clearPhoto();
  }, [clearPhoto, resetSignal]);

  useEffect(() => {
    return () => {
      revokePhotoUrl();
    };
  }, [revokePhotoUrl]);

  const handlePhotoSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    revokePhotoUrl();
    const nextUrl = URL.createObjectURL(file);
    photoUrlRef.current = nextUrl;
    setPhotoUrl(nextUrl);
    setPhotoStatus("processing");

    try {
      const gpsData = await extractGPSFromExif(file);

      if (gpsData) {
        onSitePlusCodeChange(
          coordinatesToPlusCode(gpsData.latitude, gpsData.longitude),
        );
        setPhotoStatus("success");
      } else {
        setPhotoStatus("no_gps");
      }
    } catch (error) {
      console.error("Failed to derive location code from photo:", error);
      setPhotoStatus("no_gps");
    }
  };

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
          <Label htmlFor="customer-location-code">Location code</Label>
          <Input
            id="customer-location-code"
            value={sitePlusCode}
            onChange={(event) => onSitePlusCodeChange(event.target.value)}
            placeholder="e.g. 8FVC9G8F+5W or 7JV8+P2 Mohali, Punjab"
            maxLength={80}
            className="min-h-11"
            aria-invalid={Boolean(validationErrors.sitePlusCode)}
          />
          {validationErrors.sitePlusCode && (
            <p className="text-sm text-destructive">
              {validationErrors.sitePlusCode}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Site Photo
          </Label>

          {photoUrl ? (
            <div className="space-y-3">
              <img
                src={photoUrl}
                alt="Customer site preview"
                className="h-32 w-32 rounded-lg border object-cover"
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => takePhotoInputRef.current?.click()}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Take photo
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => choosePhotoInputRef.current?.click()}
                >
                  <ImagePlus className="mr-2 h-4 w-4" />
                  Choose photo
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  onClick={clearPhoto}
                >
                  <X className="mr-2 h-4 w-4" />
                  Remove photo
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1"
                onClick={() => takePhotoInputRef.current?.click()}
              >
                <Camera className="mr-2 h-4 w-4" />
                Take photo
              </Button>

              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1"
                onClick={() => choosePhotoInputRef.current?.click()}
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                Choose photo
              </Button>
            </div>
          )}

          <input
            ref={takePhotoInputRef}
            id="customer-take-photo"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelected}
            className="hidden"
          />
          <input
            ref={choosePhotoInputRef}
            id="customer-choose-photo"
            type="file"
            accept="image/*"
            onChange={handlePhotoSelected}
            className="hidden"
          />

          <div
            role="status"
            aria-live="polite"
            className="min-h-5 text-sm text-muted-foreground"
          >
            {photoStatus === "processing" && (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading photo location…
              </span>
            )}
            {photoStatus === "success" && (
              <span>Location code filled from photo</span>
            )}
            {photoStatus === "no_gps" && (
              <span>
                No GPS data found in this photo. Type the location code or paste
                it from Google Maps.
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            The photo is used only in your browser to derive the location code.
            It is not uploaded or stored.
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          Manual location-code entry is optional.
        </p>
      </CardContent>
    </Card>
  );
}
