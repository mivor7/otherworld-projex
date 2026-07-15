// The house mark — companion piece to the $RIBBIT coin: same luminous
// green, segmented ring and circuit ticks, with the angular frog glyph at
// the center. Static IDs keep it usable in server components; duplicate
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
        <radialGradient id="owp2-disc" cx="0.5" cy="0.45" r="0.65">
          <stop offset="0" stopColor="#122019" />
          <stop offset="0.75" stopColor="#0a100e" />
          <stop offset="1" stopColor="#070b0a" />
        </radialGradient>
        <linearGradient id="owp2-ring" x1="10" y1="10" x2="86" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#b8f7c4" />
          <stop offset="0.5" stopColor="#5fe98a" />
          <stop offset="1" stopColor="#2f9a55" />
        </linearGradient>
        <radialGradient id="owp2-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.55" stopColor="#78f5a0" stopOpacity="0" />
          <stop offset="0.85" stopColor="#78f5a0" stopOpacity="0.16" />
          <stop offset="1" stopColor="#78f5a0" stopOpacity="0" />
        </radialGradient>
        <filter id="owp2-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx="48" cy="48" r="45" fill="url(#owp2-disc)" />
      <circle cx="48" cy="48" r="45" fill="url(#owp2-halo)" />

      <circle cx="48" cy="48" r="44" stroke="url(#owp2-ring)" strokeWidth="2" />
      <circle
        cx="48" cy="48" r="39.5"
        stroke="#5fe98a" strokeOpacity="0.55" strokeWidth="1.4" strokeDasharray="5 3.2"
      />
      <circle cx="48" cy="48" r="35.5" stroke="#5fe98a" strokeOpacity="0.2" strokeWidth="0.8" />

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

      <g filter="url(#owp2-glow)">
        <path
          d="M28 52.5 L29 42 L32 33.5 L38.5 31 L43.5 36 L48 37.2 L52.5 36 L57.5 31 L64 33.5 L67 42 L68 52.5 L59 61 L48 63.5 L37 61 Z"
          fill="#9df7b5"
        />
      </g>
      <circle cx="37" cy="38" r="4.2" fill="#0a100e" />
      <circle cx="59" cy="38" r="4.2" fill="#0a100e" />
      <ellipse cx="37" cy="38" rx="1.1" ry="2.9" fill="#9df7b5" />
      <ellipse cx="59" cy="38" rx="1.1" ry="2.9" fill="#9df7b5" />
      <path d="M44.6 63.3 L48 58.8 L51.4 63.3 Z" fill="#0a100e" />
      <path
        d="M34.5 51.5 Q48 55 61.5 51.5"
        stroke="#0a100e" strokeOpacity="0.65" strokeWidth="1.6" fill="none" strokeLinecap="round"
      />
    </svg>
  );
}
