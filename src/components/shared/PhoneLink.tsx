import React from "react";
import { cn } from "@/lib/utils";
import { useLogActivity } from "@/hooks/useActivityLog";
import { logToStaffActivity } from "@/lib/staffActivityLogger";
import { useAuth } from "@/contexts/AuthContext";

function toTelHref(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  // Preserve leading + for international numbers,
  // strip all non-digit characters from the rest
  const normalized = trimmed.startsWith("+")
    ? "+" + trimmed.slice(1).replace(/[^\d]/g, "")
    : trimmed.replace(/[^\d]/g, "");
  if (!normalized || normalized === "+") return null;
  return `tel:${normalized}`;
}

export function PhoneLink({
  phone,
  className,
  onClick,
  log,
}: {
  phone: string | null | undefined;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  log?: {
    leadId?: string;
    customerId?: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
  };
}) {
  const { logActivity } = useLogActivity();
  const { user } = useAuth();

  if (!phone) return null;

  const href = toTelHref(phone);

  // If number can't be normalized, show as plain text
  if (!href) return <span className={className}>{phone}</span>;

  const handleClick: React.MouseEventHandler<HTMLAnchorElement> = async (e) => {
    // Don't prevent default — let the tel: link fire naturally
    try {
      if (log?.leadId || log?.customerId || log?.relatedEntityType) {
        await logActivity({
          lead_id: log?.leadId,
          customer_id: log?.customerId,
          activity_type: 'phone_call',
          activity_category: 'communication',
          title: 'Phone Call Initiated',
          description: `Called ${phone}`,
          metadata: {
            phone,
            href,
            source: 'ui_click',
          },
          related_entity_type: log?.relatedEntityType,
          related_entity_id: log?.relatedEntityId,
        });
      }
      if (user) {
        await logToStaffActivity(
          'call_made',
          user.email || '',
          user.id,
          `Called ${phone}`,
          log?.leadId ? 'lead'
            : log?.customerId ? 'customer' : undefined,
          log?.leadId || log?.customerId || undefined,
          {
            phone_number: phone,
            lead_id: log?.leadId,
            customer_id: log?.customerId
          }
        );
      }
    } catch {
      // Never block the dial action if logging fails
    } finally {
      onClick?.(e);
    }
  };

  return (
    <a
      href={href}
      className={cn(
        "text-primary hover:underline underline-offset-4 whitespace-nowrap",
        className
      )}
      onClick={handleClick}
      target="_self"
      rel="noopener noreferrer"
    >
      {phone}
    </a>
  );
}
