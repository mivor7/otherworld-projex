// The house mark — the OWP scope emblem (public/art/logo.png). Kept as the
// `SealMark` component so every call site (navbar, footer, vault intro, 404,
// loading) picks it up from one place. Circle-cropped PNG with transparent
// corners, so it sits cleanly on any background.
export function SealMark({ size = 36 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/art/logo.png"
      alt="Other World Projex"
      width={size}
      height={size}
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}
