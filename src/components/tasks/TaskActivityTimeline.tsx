import React, { useMemo, useState } from "react";
import { formatDistanceToNow, parseISO, format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TaskActivityLogEntry } from "@/hooks/useTaskActivityLog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ArrowRight, CalendarClock, CheckCircle2, FileText, Link2, PlusCircle } from "lucide-react";

function prettyEventType(type: string) {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function EventIcon({ type }: { type: string }) {
  switch (type) {
    case "rescheduled": return <CalendarClock className="h-4 w-4 text-amber-500" />;
    case "closed": return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "outcome_recorded": return <FileText className="h-4 w-4 text-blue-500" />;
    case "follow_up_created": return <PlusCircle className="h-4 w-4 text-violet-500" />;
    case "created": return <PlusCircle className="h-4 w-4 text-muted-foreground" />;
    default: return null;
  }
}

function RichMetadata({
  entry,
  onOpenTask,
}: {
  entry: TaskActivityLogEntry;
  onOpenTask?: (taskId: string) => void;
}) {
  const m = entry.metadata as Record<string, any> | null;
  if (!m) return null;

  switch (entry.event_type) {
    case "rescheduled": {
      const oldDate = m.old_value?.due_date;
      const newDate = m.new_value?.due_date;
      return (
        <div className="mt-2 space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{oldDate || "—"}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">{newDate || "—"}</span>
          </div>
          {m.reason && (
            <div className="text-muted-foreground">Reason: {m.reason}</div>
          )}
        </div>
      );
    }

    case "outcome_recorded": {
      return (
        <div className="mt-2 text-sm">
          {m.outcome && <div>Outcome: <span className="font-medium">{m.outcome}</span></div>}
          {m.notes && <div className="text-muted-foreground mt-1 whitespace-pre-wrap">{m.notes}</div>}
        </div>
      );
    }

    case "follow_up_created": {
      return (
        <div className="mt-2 text-sm">
          <div className="flex items-center gap-2">
            <Link2 className="h-3 w-3 text-muted-foreground" />
            {onOpenTask && m.new_task_id ? (
              <Button
                variant="link"
                className="h-auto p-0 text-sm"
                onClick={() => onOpenTask(m.new_task_id)}
              >
                {m.new_task_title || "Follow-up task"}
              </Button>
            ) : (
              <span>{m.new_task_title || "Follow-up task"}</span>
            )}
            {m.due_date && <span className="text-muted-foreground">• {m.due_date}</span>}
          </div>
        </div>
      );
    }

    case "closed": {
      return (
        <div className="mt-2 text-sm text-muted-foreground">
          {m.outcome && <span>Outcome: {m.outcome}</span>}
        </div>
      );
    }

    default: {
      if (!m || Object.keys(m).length === 0) return null;
      return (
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer">Details</summary>
          <pre className="mt-2 text-xs bg-muted rounded p-2 overflow-auto">
            {JSON.stringify(m, null, 2)}
          </pre>
        </details>
      );
    }
  }
}

export function TaskActivityTimeline({
  entries,
  loading,
  hasMore,
  onLoadMore,
  onOpenTask,
}: {
  entries: TaskActivityLogEntry[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onOpenTask?: (taskId: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const hay = [e.event_type, e.user_name, e.notes || "", JSON.stringify(e.metadata || {})]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [entries, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="text-sm font-medium">Activity</div>
        <div className="w-full sm:w-[280px]">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search activity…"
          />
        </div>
      </div>

      <Card className="p-3">
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="ml-2 text-sm">Loading activity…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No activity yet.</div>
        ) : (
          <ScrollArea className="h-[360px]">
            <div className="space-y-3 pr-3">
              {filtered.map((e) => (
                <div key={e.id} className="border rounded-md p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <EventIcon type={e.event_type} />
                      <Badge variant="secondary" className="shrink-0">
                        {prettyEventType(e.event_type)}
                      </Badge>
                      <div className="text-xs text-muted-foreground truncate">
                        {e.user_name}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(parseISO(e.created_at), { addSuffix: true })}
                    </div>
                  </div>

                  {e.notes && <div className="mt-2 text-sm whitespace-pre-wrap">{e.notes}</div>}

                  <RichMetadata entry={e} onOpenTask={onOpenTask} />
                </div>
              ))}

              {hasMore && (
                <div className="pt-2 flex justify-center">
                  <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loading}>
                    {loading ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </Card>
    </div>
  );
}
