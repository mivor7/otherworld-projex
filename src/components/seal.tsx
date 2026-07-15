// The house mark — an angular OWP monogram in the $RIBBIT coin's glyph
// language: same luminous green, segmented ring, circuit ticks. Coin = the
// token, monogram = the house. Static IDs keep it usable in server
// components; duplicate defs across instances render fine.
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
        <radialGradient id="owp3-disc" cx="0.5" cy="0.45" r="0.65">
          <stop offset="0" stopColor="#122019" />
          <stop offset="0.75" stopColor="#0a100e" />
          <stop offset="1" stopColor="#070b0a" />
        </radialGradient>
        <linearGradient id="owp3-ring" x1="10" y1="10" x2="86" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#b8f7c4" />
          <stop offset="0.5" stopColor="#5fe98a" />
          <stop offset="1" stopColor="#2f9a55" />
        </linearGradient>
        <radialGradient id="owp3-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.55" stopColor="#78f5a0" stopOpacity="0" />
          <stop offset="0.85" stopColor="#78f5a0" stopOpacity="0.16" />
          <stop offset="1" stopColor="#78f5a0" stopOpacity="0" />
        </radialGradient>
        <filter id="owp3-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx="48" cy="48" r="45" fill="url(#owp3-disc)" />
      <circle cx="48" cy="48" r="45" fill="url(#owp3-halo)" />
      <circle cx="48" cy="48" r="44" stroke="url(#owp3-ring)" strokeWidth="2" />
      <circle
        cx="48" cy="48" r="39.5"
        stroke="#5fe98a" strokeOpacity="0.55" strokeWidth="1.4" strokeDasharray="5 3.2"
      />

      <g stroke="#5fe98a" strokeOpacity="0.7" strokeWidth="1.3" strokeLinecap="round">
        <path d="M18.5 18.5 L24 24" />
        <path d="M77.5 18.5 L72 24" />
        <path d="M18.5 77.5 L24 72" />
        <path d="M77.5 77.5 L72 72" />
      </g>
      <g fill="#5fe98a">
        <circle cx="17" cy="17" r="1.6" />
        <circle cx="79" cy="17" r="1.6" />
        <circle cx="17" cy="79" r="1.6" />
        <circle cx="79" cy="79" r="1.6" />
      </g>

      {/* OWP — angular letterforms, chamfered like the coin's R */}
      <g filter="url(#owp3-glow)">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          fill="#9df7b5"
          d="M24.5 36 L32 36 L36.5 40.5 L36.5 55.5 L32 60 L24.5 60 L20 55.5 L20 40.5 Z
             M26.5 41 L30 41 L31.5 42.5 L31.5 53.5 L30 55 L26.5 55 L25 53.5 L25 42.5 Z"
        />
        <path
          d="M40 36.5 L43.7 59.5 L48.5 45.5 L53.3 59.5 L57 36.5"
          stroke="#9df7b5"
          strokeWidth="5.4"
          fill="none"
          strokeLinejoin="miter"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          fill="#9df7b5"
          d="M61 36 L72.5 36 L77 40.5 L77 46.5 L72.5 51 L66.5 51 L66.5 60 L63.2 60 L61 57.8 Z
             M66.5 41 L70.8 41 L72 42.2 L72 44.8 L70.8 46 L66.5 46 Z"
        />
      </g>
    </svg>
  );
}
