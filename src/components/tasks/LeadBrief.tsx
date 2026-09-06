import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLeadBrief } from "@/hooks/useLeadBrief";
import { useControlPanelSettings } from "@/hooks/useControlPanelSettings";
import { LeadBriefPeopleStrip } from "./LeadBriefPeopleStrip";
import { LeadBriefSiteStrip } from "./LeadBriefSiteStrip";
import { LeadBriefConversationTrail } from "./LeadBriefConversationTrail";

const STORAGE_KEY = "task_lead_brief_collapsed";

interface LeadBriefProps {
  leadId?: string | null;
  taskId?: string | null;
  onLeadClick?: () => void;
}

export function LeadBrief({ leadId, taskId, onLeadClick }: LeadBriefProps) {
  const { getOptionLabel } = useControlPanelSettings();
  const { lead, professionals, trail, loading } = useLeadBrief({ leadId, taskId }, Boolean(leadId || taskId));
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      setOpen(localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      // Ignore storage failures.
    }
  }, []);

  if (!leadId && !taskId) return null;
  if (loading && !lead) {
    return <Card className="mb-6"><CardContent className="py-4 text-xs text-muted-foreground">Loading lead brief…</CardContent></Card>;
  }
  if (!lead) {
    return <Card className="mb-6"><CardContent className="py-4 text-xs text-muted-foreground">Lead context unavailable.</CardContent></Card>;
  }

  const isLost = Boolean(lead.deleted_at) || /lost|deleted/i.test(lead.status || "");
  const displayStatus = lead.status || (lead.deleted_at ? "Deleted" : null);

  const toggle = (value: boolean) => {
    setOpen(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? "0" : "1");
    } catch {
      // Ignore storage failures.
    }
  };

  return (
    <Card className="mb-6 overflow-hidden border-primary/20 bg-muted/20">
      <Collapsible open={open} onOpenChange={toggle}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Lead Brief</div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" aria-label={open ? "Collapse lead brief" : "Expand lead brief"}>
                {open ? "Collapse" : "Expand"}
                <ChevronDown className={`ml-1 h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="pt-1">
            <LeadBriefPeopleStrip
              leadId={lead.id}
              name={lead.name}
              status={isLost ? displayStatus || "Deleted" : displayStatus}
              phone={lead.phone}
              alternatePhone={lead.alternate_phone}
              additionalContacts={lead.additional_contacts}
              firmName={lead.firm_name}
              professionals={professionals}
              onLeadClick={onLeadClick}
              getOptionLabel={getOptionLabel}
            />
            <LeadBriefSiteStrip
              leadId={lead.id}
              siteLocation={lead.site_location}
              plusCode={lead.site_plus_code}
              constructionStage={lead.construction_stage}
              materialInterests={lead.material_interests}
              estimatedQuantity={lead.estimated_quantity}
              getOptionLabel={getOptionLabel}
            />
            <LeadBriefConversationTrail entries={trail} />
          </CollapsibleContent>
        </div>
      </Collapsible>
    </Card>
  );
}
