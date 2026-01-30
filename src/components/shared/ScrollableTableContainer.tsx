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

    // Also observe the first table for width changes
    const table = tableContainerRef.current?.querySelector('table');
    if (table) {
      resizeObserver.observe(table);
    }

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
    <div className="rounded-md border bg-card flex flex-col group" style={{ maxHeight, minHeight: '500px' }}>
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
            ref={topScrollRef}
            className={
              "top-scrollbar sticky top-12 z-30 overflow-x-auto overflow-y-hidden " +
              "bg-muted/30 backdrop-blur-sm " +
              "opacity-70 group-hover:opacity-100 transition-opacity"
            }
            style={{ height: "10px", minHeight: "10px" }}
            onScroll={handleTopScroll}
            aria-label="Horizontal table scroll"
          >
            {/* The 1px filler creates the scrollable area; actual visuals come from scrollbar styling. */}
            <div style={{ width: scrollWidth, height: "1px" }} />
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
