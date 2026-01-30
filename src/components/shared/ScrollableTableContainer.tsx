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
  const [headerHeight, setHeaderHeight] = useState(48);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [showScrollbar, setShowScrollbar] = useState(false);

  // Update scroll width when content changes
  useEffect(() => {
    const updateScrollWidth = () => {
      if (tableContainerRef.current) {
        const scrollW = tableContainerRef.current.scrollWidth;
        const clientW = tableContainerRef.current.clientWidth;
        setScrollWidth(scrollW);
        setShowScrollbar(scrollW > clientW);

        const thead = tableContainerRef.current.querySelector('thead');
        if (thead) {
          const rect = thead.getBoundingClientRect();
          // Clamp to a sensible range to avoid weird sticky offsets.
          setHeaderHeight(Math.max(40, Math.min(80, Math.round(rect.height))));
        }
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
    const thead = tableContainerRef.current?.querySelector('thead');
    if (table) resizeObserver.observe(table);
    if (thead) resizeObserver.observe(thead);

    return () => resizeObserver.disconnect();
  }, [children]);

  // Sync scroll between top scrollbar and table container
  const handleTopScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (topScrollRef.current) {
      topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  return (
    <div className="rounded-md border bg-card flex flex-col group" style={{ maxHeight, minHeight: '650px' }}>
      {/* Table container with both scrolls */}
      <div
        ref={tableContainerRef}
        className="overflow-auto flex-1"
        onScroll={handleTableScroll}
      >
        {/*
          Sticky top horizontal scrollbar (shown only if content overflows).
          Positioned below sticky table headers (typical header height is 3rem = h-12).
        */}
        {showScrollbar && (
          <div
            className={
              "hidden lg:block sticky z-30 " +
              "bg-background/85 backdrop-blur-sm " +
              "border-b border-border "
            }
            // Place it *below* the sticky table header with a clean gap.
            style={{ top: headerHeight, paddingTop: 16, paddingBottom: 10 }}
          >
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

        {children}
      </div>
    </div>
  );
}

