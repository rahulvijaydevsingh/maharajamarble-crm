import React from "react";
import { cn } from "@/lib/utils";
import { useLogActivity } from "@/hooks/useActivityLog";

function toGoogleMapsSearchUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function PlusCodeLink({
  plusCode,
  className,
  onClick,
  log,
}: {
  plusCode: string | null | undefined;
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
  if (!plusCode) return <span className={cn("text-muted-foreground", className)}>-</span>;
  const href = toGoogleMapsSearchUrl(plusCode);

  const handleClick: React.MouseEventHandler<HTMLAnchorElement> = async (e) => {
    try {
      if (log?.leadId || log?.customerId || log?.relatedEntityType) {
        await logActivity({
          lead_id: log?.leadId,
          customer_id: log?.customerId,
          activity_type: 'map_open',
          activity_category: 'communication',
          title: 'Map Opened',
          description: `Opened location for ${plusCode}`,
          metadata: {
            plus_code: plusCode,
            href,
            source: 'ui_click',
          },
          related_entity_type: log?.relatedEntityType,
          related_entity_id: log?.relatedEntityId,
        });
      }
    } catch {
      // Don't block navigation if logging fails.
    } finally {
      onClick?.(e);
    }
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "text-primary hover:underline underline-offset-4",
        "whitespace-nowrap",
        className
      )}
      onClick={handleClick}
      title="Open in Google Maps"
    >
      {plusCode}
    </a>
  );
}
