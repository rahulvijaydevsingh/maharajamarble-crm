import React from "react";
import { MapPin } from "lucide-react";
import { PlusCodeLink } from "@/components/shared/PlusCodeLink";

export function LeadBriefSiteStrip({
  leadId,
  siteLocation,
  plusCode,
  constructionStage,
  materialInterests,
  estimatedQuantity,
  getOptionLabel,
}: {
  leadId: string;
  siteLocation?: string | null;
  plusCode?: string | null;
  constructionStage?: string | null;
  materialInterests?: string[] | null;
  estimatedQuantity?: number | null;
  getOptionLabel: (section: string, field: string, value: string) => string;
}) {
  const materials = (materialInterests || []).filter(Boolean);
  if (!siteLocation && !plusCode && !constructionStage && materials.length === 0 && estimatedQuantity == null) return null;

  return (
    <div className="mt-3 border-t pt-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {(siteLocation || plusCode) && <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
        {siteLocation && <span className="break-words">{siteLocation}</span>}
        {plusCode && <PlusCodeLink plusCode={plusCode} log={{ relatedEntityType: "lead", relatedEntityId: leadId }} />}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        {constructionStage && <span><b className="text-foreground">Stage:</b> {getOptionLabel("leads", "construction_stage", constructionStage)}</span>}
        {materials.length > 0 && <span><b className="text-foreground">Materials:</b> {materials.map((m) => getOptionLabel("leads", "material_interests", m)).join(", ")}</span>}
        {estimatedQuantity != null && <span><b className="text-foreground">Qty:</b> {estimatedQuantity}</span>}
      </div>
    </div>
  );
}
