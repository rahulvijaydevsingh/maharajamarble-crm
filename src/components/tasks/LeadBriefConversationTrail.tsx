import React from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { format } from "date-fns";

export type LeadBriefTrailEntry = {
  id: string;
  taskId: string;
  createdAt: string;
  author: string;
  type: "completed" | "rescheduled";
  text: string;
};

export function LeadBriefConversationTrail({ entries }: { entries: LeadBriefTrailEntry[] }) {
  return (
    <div className="mt-3 border-t pt-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Conversation Trail
      </div>
      {entries.length === 0 ? (
        <div className="text-xs text-muted-foreground">No prior conversations yet.</div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2 text-xs">
              {entry.type === "completed" ? (
                <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-muted-foreground">
                  {format(new Date(entry.createdAt), "dd MMM")} · {entry.author || "Staff"}
                </div>
                <div className="leading-relaxed break-words">{entry.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
