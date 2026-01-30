import React from "react";
import { cn } from "@/lib/utils";
import { useLogActivity } from "@/hooks/useActivityLog";

function toTelHref(phone: string) {
  // Keep leading +, strip everything else except digits.
  const trimmed = phone.trim();
  if (!trimmed) return null;
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
  if (!phone) return <span className={cn("text-muted-foreground", className)}>-</span>;
  const href = toTelHref(phone);
  if (!href) return <span className={cn("text-muted-foreground", className)}>{phone}</span>;

  const handleClick: React.MouseEventHandler<HTMLAnchorElement> = async (e) => {
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
    } catch {
      // Don't block the click action if logging fails.
    } finally {
      onClick?.(e);
    }
  };

  return (
    <a
      href={href}
      className={cn(
        "text-primary hover:underline underline-offset-4",
        // Prevent long numbers from breaking table layouts
        "whitespace-nowrap",
        className
      )}
      onClick={handleClick}
    >
      {phone}
    </a>
  );
}
