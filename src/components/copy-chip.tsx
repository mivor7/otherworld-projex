"use client";

// One-tap copy with inline confirmation.
import { useRef, useState } from "react";

export function CopyChip({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`btn btn-ghost !text-xs !min-h-[1.9rem] !px-2.5 ${className}`}
      aria-live="polite"
    >
      {copied ? <span className="text-neon">Copied ✓</span> : label}
    </button>
  );
}
