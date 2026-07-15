// The house mark v4 — angular OWP monogram in the $RIBBIT coin's glyph
// language (coin = R, house = OWP). Geometry and gradients mirror
// src/app/icon.svg and the brand/ exports exactly; keep all three in sync.
// Static IDs keep it usable in server components; duplicate defs across
// instances render fine.
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
        <radialGradient id="owp4-disc" cx="0.5" cy="0.42" r="0.68">
          <stop offset="0" stopColor="#15241c" />
          <stop offset="0.55" stopColor="#0c1410" />
          <stop offset="1" stopColor="#060908" />
        </radialGradient>
        <linearGradient id="owp4-ring" x1="12" y1="10" x2="84" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c8fcd4" />
          <stop offset="0.45" stopColor="#6ef09a" />
          <stop offset="1" stopColor="#2d8f52" />
        </linearGradient>
        <linearGradient id="owp4-glyph" x1="20" y1="34" x2="78" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#b8f7c4" />
          <stop offset="0.55" stopColor="#9df7b5" />
          <stop offset="1" stopColor="#6eea94" />
        </linearGradient>
      </defs>

      <circle cx="48" cy="48" r="45.5" fill="url(#owp4-disc)" />
      <circle cx="48" cy="48" r="44.2" stroke="url(#owp4-ring)" strokeWidth="2.2" />
      <circle
        cx="48" cy="48" r="39.2"
        stroke="#5fe98a" strokeOpacity="0.5" strokeWidth="1.35"
        strokeDasharray="4.8 3.4" strokeLinecap="round"
      />
      <circle cx="48" cy="48" r="35.4" stroke="#5fe98a" strokeOpacity="0.18" strokeWidth="0.8" />

      <g stroke="#5fe98a" strokeOpacity="0.72" strokeWidth="1.25" strokeLinecap="round">
        <path d="M18.2 18.2 L23.6 23.6" />
        <path d="M77.8 18.2 L72.4 23.6" />
        <path d="M18.2 77.8 L23.6 72.4" />
        <path d="M77.8 77.8 L72.4 72.4" />
      </g>
      <g fill="#5fe98a">
        <circle cx="16.8" cy="16.8" r="1.55" />
        <circle cx="79.2" cy="16.8" r="1.55" />
        <circle cx="16.8" cy="79.2" r="1.55" />
        <circle cx="79.2" cy="79.2" r="1.55" />
      </g>

      {/* O — octagonal / chamfered ring */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="url(#owp4-glyph)"
        d="M23.2 36.2 L31.4 36.2 L36.2 41 L36.2 55 L31.4 59.8 L23.2 59.8 L18.4 55 L18.4 41 Z
           M25.6 41.4 L29.4 41.4 L31.4 43.4 L31.4 52.6 L29.4 54.6 L25.6 54.6 L23.6 52.6 L23.6 43.4 Z"
      />
      {/* W — mitered zigzag, coin-weight stroke */}
      <path
        d="M39.6 36.4 L43.5 59.6 L48 46.2 L52.5 59.6 L56.4 36.4"
        stroke="url(#owp4-glyph)"
        strokeWidth="5.2"
        fill="none"
        strokeLinejoin="miter"
        strokeLinecap="butt"
      />
      {/* P — chamfered bowl + stem */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="url(#owp4-glyph)"
        d="M60.2 36.2 L72.2 36.2 L76.8 40.8 L76.8 47 L72.2 51.6 L65.8 51.6 L65.8 59.8 L62.4 59.8 L60.2 57.6 Z
           M65.8 40.8 L70.4 40.8 L71.8 42.2 L71.8 45.4 L70.4 46.8 L65.8 46.8 Z"
      />
    </svg>
  );
}
