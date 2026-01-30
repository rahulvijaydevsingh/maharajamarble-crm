import React from "react";
import { cn } from "@/lib/utils";

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
}: {
  phone: string | null | undefined;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  if (!phone) return <span className={cn("text-muted-foreground", className)}>-</span>;
  const href = toTelHref(phone);
  if (!href) return <span className={cn("text-muted-foreground", className)}>{phone}</span>;

  return (
    <a
      href={href}
      className={cn(
        "text-primary hover:underline underline-offset-4",
        // Prevent long numbers from breaking table layouts
        "whitespace-nowrap",
        className
      )}
      onClick={onClick}
    >
      {phone}
    </a>
  );
}
