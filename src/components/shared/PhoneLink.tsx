import React from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

function toTelHref(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith('+')
    ? '+' + trimmed.slice(1).replace(/[^\d]/g, '')
    : trimmed.replace(/[^\d]/g, '');
  if (!normalized || normalized === '+') return null;
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
  const { user, profile } = useAuth();

  if (!phone) return null;

  const href = toTelHref(phone);

  if (!href) {
    return (
      <span className={cn('text-muted-foreground', className)}>
        {phone}
      </span>
    );
  }

  const handleClick: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
    // Fire any external onClick handler
    onClick?.(e);

    // Log activity completely asynchronously —
    // never awaited, never blocks the tel: link,
    // never throws to React
    if (log?.leadId || log?.customerId || log?.relatedEntityType) {
      Promise.resolve()
        .then(() => import('@/integrations/supabase/client'))
        .then(({ supabase }) =>
          supabase.from('activity_log').insert({
            lead_id: log?.leadId ?? null,
            customer_id: log?.customerId ?? null,
            user_id: user?.id ?? null,
            user_name: profile?.full_name ?? user?.email?.split('@')[0] ?? 'System',
            activity_type: 'phone_call',
            activity_category: 'communication',
            title: 'Phone Call Initiated',
            description: `Called ${phone}`,
            metadata: { phone, source: 'ui_click' },
            related_entity_type: log?.relatedEntityType ?? null,
            related_entity_id: log?.relatedEntityId ?? null,
          } as any)
        )
        .catch(() => {
          // Logging failure must never surface to UI
        });
    }
    // tel: link fires natively — DO NOT call
    // e.preventDefault() here
  };

  return (
    <a
      href={href}
      className={cn(
        'text-primary hover:underline underline-offset-4 whitespace-nowrap',
        className
      )}
      onClick={handleClick}
      target="_top"
      rel="noopener noreferrer"
    >
      {phone}
    </a>
  );
}
