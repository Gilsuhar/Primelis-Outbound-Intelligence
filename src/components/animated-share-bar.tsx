"use client";

import { useEffect, useState } from "react";

export function AnimatedShareBar({
  label,
  widthPercent,
  delayMs = 0,
  trackClassName = "h-2 bg-white",
}: {
  label: string;
  widthPercent: number;
  delayMs?: number;
  trackClassName?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 60);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={`overflow-hidden rounded-full ${trackClassName}`}>
      <div
        aria-label={label}
        className="h-full rounded-full bg-lime transition-[width] duration-700 ease-out motion-reduce:transition-none"
        style={{
          transitionDelay: `${delayMs}ms`,
          width: mounted ? `${widthPercent}%` : "0%",
        }}
      />
    </div>
  );
}
