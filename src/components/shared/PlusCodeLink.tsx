import React from "react";
import { cn } from "@/lib/utils";

function toGoogleMapsSearchUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function PlusCodeLink({
  plusCode,
  className,
  onClick,
}: {
  plusCode: string | null | undefined;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  if (!plusCode) return <span className={cn("text-muted-foreground", className)}>-</span>;
  const href = toGoogleMapsSearchUrl(plusCode);

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
      onClick={onClick}
      title="Open in Google Maps"
    >
      {plusCode}
    </a>
  );
}
