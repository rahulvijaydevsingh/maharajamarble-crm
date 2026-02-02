import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Clock, CalendarClock } from "lucide-react";
import { SNOOZE_PRESETS } from "@/constants/taskConstants";

interface SnoozeMenuProps {
  onSnooze: (hours: number) => void;
  onCustomSnooze?: () => void;
  disabled?: boolean;
  variant?: "icon" | "button";
}

export function SnoozeMenu({
  onSnooze,
  onCustomSnooze,
  disabled = false,
  variant = "button",
}: SnoozeMenuProps) {
  const quickActions = SNOOZE_PRESETS.filter((p) =>
    ["later_today", "tomorrow", "next_week"].includes(p.value)
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
      <DropdownMenuContent align="end" className="w-48 z-[80]">
        {quickActions.map((preset) => (
          <DropdownMenuItem
            key={preset.value}
            onClick={() => onSnooze(preset.hours)}
          >
            <CalendarClock className="h-4 w-4 mr-2" />
            {preset.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {durationOptions.map((preset) => (
          <DropdownMenuItem
            key={preset.value}
            onClick={() => onSnooze(preset.hours)}
          >
            <Clock className="h-4 w-4 mr-2" />
            {preset.label}
          </DropdownMenuItem>
        ))}
        {onCustomSnooze && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCustomSnooze}>
              Custom...
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
