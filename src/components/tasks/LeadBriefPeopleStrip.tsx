import React from "react";
import { Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhoneLink } from "@/components/shared/PhoneLink";

type AdditionalContact = { name?: string | null; phone?: string | null; designation?: string | null };

export type LeadBriefProfessional = {
  id: string;
  name: string;
  phone: string | null;
  designation: string | null;
};

export function LeadBriefPeopleStrip({
  leadId,
  name,
  status,
  phone,
  alternatePhone,
  additionalContacts,
  firmName,
  professionals,
  onLeadClick,
  getOptionLabel,
}: {
  leadId: string;
  name: string;
  status?: string | null;
  phone?: string | null;
  alternatePhone?: string | null;
  additionalContacts?: unknown;
  firmName?: string | null;
  professionals: LeadBriefProfessional[];
  onLeadClick?: () => void;
  getOptionLabel: (section: string, field: string, value: string) => string;
}) {
  const contacts: AdditionalContact[] = Array.isArray(additionalContacts)
    ? additionalContacts.filter((c): c is AdditionalContact => Boolean(c && typeof c === "object"))
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="link" className="h-auto p-0 text-base font-semibold" onClick={onLeadClick}>{name}</Button>
        {status && <Badge variant="outline">{getOptionLabel("leads", "status", status)}</Badge>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {phone && <PhoneLink phone={phone} log={{ relatedEntityType: "lead", relatedEntityId: leadId }} />}
          {phone && <Button asChild variant="outline" size="sm"><a href={`https://wa.me/${phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer noopener">WhatsApp</a></Button>}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {alternatePhone && <PhoneLink phone={alternatePhone} log={{ relatedEntityType: "lead", relatedEntityId: leadId }} />}
        {firmName && <span>🏢 {firmName}</span>}
      </div>

      {contacts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {contacts.slice(0, 4).map((contact, index) => (
            <div key={`${contact.name || "contact"}-${contact.phone || index}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
              <span>{contact.designation || "Contact"}: {contact.name || contact.phone || "—"}</span>
              {contact.phone ? <PhoneLink phone={contact.phone} log={{ relatedEntityType: "lead", relatedEntityId: leadId }} /> : <Phone className="h-3 w-3 text-muted-foreground" />}
            </div>
          ))}
        </div>
      )}

      {professionals.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {professionals.slice(0, 4).map((p) => (
            <div key={p.id} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
              <span>{p.designation || "Professional"}: {p.name}</span>
              {p.phone ? <PhoneLink phone={p.phone} log={{ relatedEntityType: "professional", relatedEntityId: p.id }} /> : <Phone className="h-3 w-3 text-muted-foreground" />}
            </div>
          ))}
          {professionals.length > 4 && <Badge variant="secondary">+{professionals.length - 4} more</Badge>}
        </div>
      )}
    </div>
  );
}
