'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Holds the CSS animations inside (draw-line, fade-up, pulse) on their first frame
 * until the block is scrolled into view, then plays them once.
 */
export default function PlayOnView({
  children,
  className = '',
  threshold = 0.45,
}: {
  children: React.ReactNode;
  className?: string;
  threshold?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      // Very old browsers: just play
      const id = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(id);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div ref={ref} data-in-view={inView} className={`play-on-view ${className}`}>
      {children}
    </div>
  );
}
