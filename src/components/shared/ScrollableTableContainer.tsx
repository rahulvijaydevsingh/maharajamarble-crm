import React, { useRef, useEffect, useState, ReactNode } from "react";

interface ScrollableTableContainerProps {
  children: ReactNode;
  maxHeight?: string;
}

export function ScrollableTableContainer({ 
  children, 
  maxHeight = "calc(100vh - 280px)" 
}: ScrollableTableContainerProps) {
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [showScrollbar, setShowScrollbar] = useState(false);
  const syncingFromTop = useRef(false);
  const syncingFromTable = useRef(false);

  // Update scroll width when content changes
  useEffect(() => {
    const updateScrollWidth = () => {
      if (tableContainerRef.current) {
        const scrollW = tableContainerRef.current.scrollWidth;
        const clientW = tableContainerRef.current.clientWidth;
        setScrollWidth(scrollW);
        setShowScrollbar(scrollW > clientW);
      }
    };

    updateScrollWidth();

    // Use ResizeObserver for better performance
    const resizeObserver = new ResizeObserver(updateScrollWidth);
    if (tableContainerRef.current) {
      resizeObserver.observe(tableContainerRef.current);
    }

    // Also observe the table + header for size changes
    const table = tableContainerRef.current?.querySelector('table');
    if (table) resizeObserver.observe(table);

    return () => resizeObserver.disconnect();
  }, [children]);

  // Sync scroll between top scrollbar and table container
  const handleTopScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (syncingFromTable.current) return;
    if (tableContainerRef.current) {
      syncingFromTop.current = true;
      tableContainerRef.current.scrollLeft = e.currentTarget.scrollLeft;
      // release on next frame so wheel/drag stays smooth
      requestAnimationFrame(() => {
        syncingFromTop.current = false;
      });
    }
  };

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (syncingFromTop.current) return;
    if (topScrollRef.current) {
      syncingFromTable.current = true;
      topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
      requestAnimationFrame(() => {
        syncingFromTable.current = false;
      });
    }
  };

  return (
    <div className="rounded-md border bg-card flex flex-col group" style={{ maxHeight, minHeight: '650px' }}>
      {/* Always-available top horizontal scrollbar (only renders when overflow exists) */}
      {showScrollbar && (
        <div className="shrink-0 bg-background/85 backdrop-blur-sm border-b border-border py-3">
          <div
            ref={topScrollRef}
            className={
              "top-scrollbar mx-3 overflow-x-auto overflow-y-hidden " +
              "rounded-full bg-muted/50 shadow-inner " +
              "opacity-60 group-hover:opacity-100 transition-opacity"
            }
            style={{ height: 12 }}
            onScroll={handleTopScroll}
            aria-label="Horizontal table scroll"
          >
            {/* The 1px filler creates the scrollable area; actual visuals come from scrollbar styling. */}
            <div style={{ width: scrollWidth, height: 1 }} />
          </div>
        </div>
      )}

      {/* Table viewport (vertical + horizontal scroll) */}
      <div
        ref={tableContainerRef}
        className="overflow-auto flex-1"
        onScroll={handleTableScroll}
      >
        {children}
      </div>
    </div>
  );
}

