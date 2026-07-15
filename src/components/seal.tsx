// The house mark v5 — circuit OWP monogram inside a technical dial ring.
// Geometry mirrors src/app/icon.svg and the brand/ exports exactly; keep all
// three in sync. Static IDs keep it usable in server components; duplicate
// defs across instances render fine.
export function SealMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Other World Projex mark"
    >
      <defs>
        <radialGradient id="owp5-disc" cx="0.5" cy="0.42" r="0.7">
          <stop offset="0" stopColor="#101c16" />
          <stop offset="0.6" stopColor="#080d0b" />
          <stop offset="1" stopColor="#040606" />
        </radialGradient>
        <linearGradient id="owp5-ring" x1="10" y1="8" x2="86" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d4ffe0" />
          <stop offset="0.4" stopColor="#8ff5b0" />
          <stop offset="1" stopColor="#3aa86a" />
        </linearGradient>
        <linearGradient id="owp5-glyph" x1="16" y1="32" x2="80" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c8fdd6" />
          <stop offset="0.5" stopColor="#9df7b5" />
          <stop offset="1" stopColor="#6eeba0" />
        </linearGradient>
      </defs>

      <circle cx="48" cy="48" r="45.5" fill="url(#owp5-disc)" />
      <circle cx="48" cy="48" r="44" stroke="url(#owp5-ring)" strokeWidth="1.8" />
      <circle cx="48" cy="48" r="40.2" stroke="#7aef9c" strokeOpacity="0.35" strokeWidth="0.9" />
      <circle
        cx="48" cy="48" r="37.5"
        stroke="#7aef9c" strokeOpacity="0.55" strokeWidth="1.1"
        strokeDasharray="2.2 2.8" strokeLinecap="round"
      />
      <circle
        cx="48" cy="48" r="42.2"
        stroke="#9df7b5" strokeOpacity="0.22" strokeWidth="0.6" strokeDasharray="18 40"
      />

      {/* cardinal crosshair nodes */}
      <g fill="#9df7b5" stroke="#9df7b5" strokeWidth="0.9">
        <path d="M48 8.5 V13.5 M46 11 H50" strokeLinecap="square" />
        <path d="M48 82.5 V87.5 M46 85 H50" strokeLinecap="square" />
        <path d="M8.5 48 H13.5 M11 46 V50" strokeLinecap="square" />
        <path d="M82.5 48 H87.5 M85 46 V50" strokeLinecap="square" />
      </g>

      {/* O: octagonal circuit ring */}
      <path
        fill="none" stroke="url(#owp5-glyph)" strokeWidth="3.6"
        strokeLinejoin="miter" strokeLinecap="butt"
        d="M20 42 L24.5 36.5 L31.5 36.5 L36 42 L36 54 L31.5 59.5 L24.5 59.5 L20 54 Z"
      />
      <path
        fill="none" stroke="url(#owp5-glyph)" strokeWidth="1.2" strokeOpacity="0.7"
        d="M23.2 43 L26.2 39.2 L30 39.2 L32.8 43 L32.8 53 L30 56.8 L26.2 56.8 L23.2 53 Z"
      />
      <g fill="#9df7b5">
        <rect x="26.5" y="35.3" width="3.2" height="1.8" rx="0.4" />
        <rect x="26.5" y="58.9" width="3.2" height="1.8" rx="0.4" />
      </g>

      {/* W: double-stroke angular */}
      <path
        fill="none" stroke="url(#owp5-glyph)" strokeWidth="3.4"
        strokeLinejoin="miter" strokeLinecap="butt"
        d="M39.5 37 L43.2 59 L48 45.5 L52.8 59 L56.5 37"
      />
      <path
        fill="none" stroke="url(#owp5-glyph)" strokeWidth="1.15" strokeOpacity="0.65"
        d="M41.3 39.2 L44 55.5 L48 44.2 L52 55.5 L54.7 39.2"
      />

      {/* P: circuit bowl with traces */}
      <path
        fill="none" stroke="url(#owp5-glyph)" strokeWidth="3.6" strokeLinejoin="miter"
        d="M61 37 L72.5 37 L77 41.5 L77 48 L72.5 52.5 L64.5 52.5 L64.5 59"
      />
      <path
        fill="none" stroke="url(#owp5-glyph)" strokeWidth="1.2" strokeOpacity="0.7"
        d="M64.2 40.2 L71 40.2 L73.5 42.5 L73.5 46.8 L71 49.2 L64.2 49.2"
      />
      <g stroke="#9df7b5" strokeWidth="1.1" strokeLinecap="round" fill="none" opacity="0.85">
        <path d="M74.5 44.5 H79.5" />
        <path d="M74.5 47 H78" />
        <circle cx="80.2" cy="44.5" r="1.1" fill="#9df7b5" stroke="none" />
        <circle cx="78.8" cy="47" r="0.9" fill="#9df7b5" stroke="none" />
      </g>
    </svg>
  );
}
