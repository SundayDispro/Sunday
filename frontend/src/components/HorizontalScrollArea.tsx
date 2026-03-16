import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Área con scroll horizontal y barra dibujada por la app (siempre visible cuando hay overflow).
 * Funciona en todos los navegadores (Arc, Edge, etc.) al no depender de la barra nativa.
 */
export function HorizontalScrollArea({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);
  const [thumbStyle, setThumbStyle] = useState({ width: 0, left: 0 });
  const [scrollPercent, setScrollPercent] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, scrollLeft: 0 });

  const updateScrollbar = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    const overflow = scrollWidth > clientWidth;
    setShowBar(overflow);
    const scrollRange = scrollWidth - clientWidth;
    if (!overflow) return;
    setScrollPercent(scrollRange <= 0 ? 0 : Math.round((scrollLeft / scrollRange) * 100));
    const trackWidth = trackRef.current?.clientWidth ?? clientWidth;
    const thumbWidth = Math.max(24, (clientWidth / scrollWidth) * trackWidth);
    const maxLeft = trackWidth - thumbWidth;
    const left = scrollRange <= 0 ? 0 : (scrollLeft / scrollRange) * maxLeft;
    setThumbStyle({ width: thumbWidth, left });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollbar();
    const ro = new ResizeObserver(updateScrollbar);
    ro.observe(el);
    el.addEventListener('scroll', updateScrollbar);
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', updateScrollbar);
    };
  }, [updateScrollbar, children]);

  useEffect(() => {
    if (showBar && trackRef.current) requestAnimationFrame(updateScrollbar);
  }, [showBar, updateScrollbar]);

  const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track || !showBar) return;
    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const trackWidth = track.clientWidth;
    const thumbWidth = thumbStyle.width;
    const maxLeft = trackWidth - thumbWidth;
    const scrollRange = el.scrollWidth - el.clientWidth;
    if (maxLeft <= 0 || scrollRange <= 0) return;
    const clickRatio = Math.max(0, Math.min(1, (x - thumbWidth / 2) / maxLeft));
    el.scrollLeft = clickRatio * scrollRange;
  };

  const onThumbMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!scrollRef.current || !trackRef.current) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, scrollLeft: scrollRef.current.scrollLeft };
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const el = scrollRef.current;
      const track = trackRef.current;
      if (!el || !track) return;
      const delta = e.clientX - dragStart.current.x;
      const trackWidth = track.clientWidth;
      const scrollRange = el.scrollWidth - el.clientWidth;
      if (scrollRange <= 0) return;
      const thumbWidth = Math.max(24, (el.clientWidth / el.scrollWidth) * trackWidth);
      const maxLeft = trackWidth - thumbWidth;
      if (maxLeft <= 0) return;
      const ratio = delta / maxLeft;
      const newScroll = dragStart.current.scrollLeft + ratio * scrollRange;
      el.scrollLeft = Math.max(0, Math.min(scrollRange, newScroll));
      dragStart.current = { x: e.clientX, scrollLeft: el.scrollLeft };
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  return (
    <div className={`min-w-0 ${className}`.trim()}>
      <div
        ref={scrollRef}
        className="horizontal-scroll-area-hide-native min-w-0 w-full overflow-x-auto overflow-y-hidden scroll-touch"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x',
        }}
      >
        {children}
      </div>
      {showBar && (
        <div
          ref={trackRef}
          role="scrollbar"
          aria-orientation="horizontal"
          aria-valuenow={scrollPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2.5 min-h-[44px] sm:min-h-0 w-full mt-0.5 rounded-full cursor-pointer flex items-center"
          style={{ background: 'var(--scrollbar-track, rgba(0,0,0,0.06))' }}
          onClick={onTrackClick}
        >
          <div
            className="h-1.5 rounded-full flex-shrink-0 transition-colors"
            style={{
              width: thumbStyle.width,
              marginLeft: thumbStyle.left,
              background: 'var(--scrollbar-thumb, #a9b0c5)',
            }}
            onMouseDown={onThumbMouseDown}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--scrollbar-thumb-hover, #7c85a0)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--scrollbar-thumb, #a9b0c5)';
            }}
          />
        </div>
      )}
    </div>
  );
}
