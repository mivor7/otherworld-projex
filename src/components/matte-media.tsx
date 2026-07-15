"use client";

// Museum matting for artwork of any aspect ratio: the image itself, blurred
// and dimmed, fills the box behind the fully-visible contained original.
// Broken/unreachable sources fall back to the house chest art. Drop inside a
// positioned container (e.g. .card-media).
import { useEffect, useState } from "react";

const FALLBACK = "/art/art-empty-chest.jpg";

export function MatteMedia({
  src,
  alt = "",
  loading = "lazy",
}: {
  src: string;
  alt?: string;
  loading?: "lazy" | "eager";
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBroken(false);
  }, [src]);
  const shown = broken || !src ? FALLBACK : src;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shown} alt="" aria-hidden className="media-matte-bg" loading={loading} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={shown}
        alt={alt}
        className="media-matte-fg"
        loading={loading}
        onError={() => setBroken(true)}
      />
    </>
  );
}
