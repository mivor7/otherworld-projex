"use client";

// Count-up numeral: animates the leading number of a stat string the first
// time it scrolls into view. Non-numeric strings render untouched.
import { useEffect, useRef, useState } from "react";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function Ticker({ text, duration = 900 }: { text: string; duration?: number }) {
  const match = /^([0-9][\d,]*(?:\.\d+)?)([\s\S]*)$/.exec(text.trim());
  const target = match ? parseFloat(match[1].replace(/,/g, "")) : 0;
  const decimals = match?.[1].includes(".") ? match[1].split(".")[1].length : 0;
  const suffix = match?.[2] ?? "";

  const ref = useRef<HTMLSpanElement>(null);
  // Starts at the REAL value: server HTML, no-JS and failed-hydration visitors
  // see the true stat, never a 0. The count-up only zeroes once it actually runs.
  const [value, setValue] = useState(target);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !match) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // One-time mount gate, not a render loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(target);
      setDone(true);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / duration);
          setValue(target * easeOut(t));
          if (t < 1) raf = requestAnimationFrame(step);
          else setDone(true);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  if (!match) return <>{text}</>;
  const shown = done ? target : value;
  return (
    <span ref={ref}>
      {shown.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}
