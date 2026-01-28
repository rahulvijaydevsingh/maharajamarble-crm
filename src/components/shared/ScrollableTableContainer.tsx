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
  const [containerWidth, setContainerWidth] = useState(0);
  const [showScrollbar, setShowScrollbar] = useState(false);

  // Update scroll width when content changes
  useEffect(() => {
    const updateScrollWidth = () => {
      if (tableContainerRef.current) {
        const scrollW = tableContainerRef.current.scrollWidth;
        const clientW = tableContainerRef.current.clientWidth;
        setScrollWidth(scrollW);
        setContainerWidth(clientW);
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
    <div className="rounded-md border bg-card flex flex-col" style={{ maxHeight, minHeight: '500px' }}>
      {/* Top horizontal scrollbar - only show if content overflows */}
      {showScrollbar && (
        <div 
          ref={topScrollRef}
          className="overflow-x-auto overflow-y-hidden flex-shrink-0 border-b bg-muted/30"
          style={{ height: '12px', minHeight: '12px' }}
          onScroll={handleTopScroll}
        >
          <div style={{ width: scrollWidth, height: '1px' }} />
        </div>
      )}
      
      {/* Table container with both scrolls */}
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
