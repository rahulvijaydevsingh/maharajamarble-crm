import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Clock, CalendarClock, Sunrise } from "lucide-react";
import { SNOOZE_PRESETS } from "@/constants/taskConstants";

interface SnoozeMenuProps {
  onSnooze: (hours: number) => void;
  onCustomSnooze?: () => void;
  disabled?: boolean;
  variant?: "icon" | "button";
}

// "Tomorrow Morning" snoozes to a fixed clock time (10:00 AM the next
// calendar day), not a flat duration like the rest of SNOOZE_PRESETS, so
// it's computed here at click time instead of stored as a static constant.
function getHoursUntilTomorrowMorning(): number {
  const now = new Date();
  const target = new Date(now);
  target.setDate(target.getDate() + 1);
  target.setHours(10, 0, 0, 0);
  return (target.getTime() - now.getTime()) / (1000 * 60 * 60);
}

export function SnoozeMenu({
  onSnooze,
  onCustomSnooze,
  disabled = false,
  variant = "button",
}: SnoozeMenuProps) {
  const quickActions = SNOOZE_PRESETS.filter((p) =>
    ["later_today", "tomorrow", "2_days", "next_week"].includes(p.value)
  );
  const durationOptions = SNOOZE_PRESETS.filter((p) =>
    ["15_min", "30_min", "1_hour", "2_hours"].includes(p.value)
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={disabled}>
            <Clock className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={disabled}>
            <Clock className="h-4 w-4 mr-2" />
            Snooze
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 z-[130]">
        {quickActions.map((preset) => (
          <DropdownMenuItem key={preset.value} onClick={() => onSnooze(preset.hours)}>
            <CalendarClock className="h-4 w-4 mr-2" />
            {preset.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={() => onSnooze(getHoursUntilTomorrowMorning())}>
          <Sunrise className="h-4 w-4 mr-2" />
          Tomorrow Morning (10:00 AM)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {durationOptions.map((preset) => (
          <DropdownMenuItem key={preset.value} onClick={() => onSnooze(preset.hours)}>
            <Clock className="h-4 w-4 mr-2" />
            {preset.label}
          </DropdownMenuItem>
        ))}
        {onCustomSnooze && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCustomSnooze}>Custom...</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
