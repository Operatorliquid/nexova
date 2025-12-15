import React, { useMemo, useRef, useState, useEffect } from "react";
import type { CSSProperties } from "react";

type VirtualizedListProps<T> = {
  items: T[];
  itemHeight: number; // px
  overscan?: number;
  height?: number; // px
  className?: string;
  renderItem: (args: { item: T; index: number; style: CSSProperties }) => React.ReactNode;
};

export function VirtualizedList<T>({
  items,
  itemHeight,
  overscan = 3,
  height = 640,
  className,
  renderItem,
}: VirtualizedListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = useMemo(() => items.length * itemHeight, [items.length, itemHeight]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + height) / itemHeight) + overscan
  );

  const visibleItems = items.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", height, overflowY: "auto" }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleItems.map((item, idx) => {
          const actualIndex = startIndex + idx;
          const top = actualIndex * itemHeight;
          const style: CSSProperties = {
            position: "absolute",
            top,
            left: 0,
            right: 0,
            height: itemHeight,
          };
          return (
            <React.Fragment key={actualIndex}>
              {renderItem({ item, index: actualIndex, style })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default VirtualizedList;
