import React, { useMemo, useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TaskActivityLogEntry } from "@/hooks/useTaskActivityLog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";

function prettyEventType(type: string) {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function TaskActivityTimeline({
  entries,
  loading,
  hasMore,
  onLoadMore,
}: {
  entries: TaskActivityLogEntry[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
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

                  {e.metadata && Object.keys(e.metadata).length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer">Details</summary>
                      <pre className="mt-2 text-xs bg-muted rounded p-2 overflow-auto">
                        {JSON.stringify(e.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
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
