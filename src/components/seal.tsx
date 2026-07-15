// The house seal — faceted frog on a hex plate. Vector twin of the raster
// seal art, crisp at every size from favicon to hero. Gradient IDs are
// static: multiple instances per page share identical defs, which renders
// fine everywhere and keeps this usable in server components.
export function SealMark({ size = 36 }: { size?: number }) {
  const plate = "owpseal-plate";
  const rim = "owpseal-rim";
  const frog = "owpseal-frog";
  const glow = "owpseal-glow";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Other World Projex seal"
    >
      <defs>
        <linearGradient id={plate} x1="48" y1="6" x2="48" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#232d2a" />
          <stop offset="1" stopColor="#0b100f" />
        </linearGradient>
        <linearGradient id={rim} x1="14" y1="14" x2="82" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8be79e" />
          <stop offset="0.55" stopColor="#3f9d5f" />
          <stop offset="1" stopColor="#8b79c9" />
        </linearGradient>
        <linearGradient id={frog} x1="30" y1="30" x2="66" y2="66" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a9f5b8" />
          <stop offset="1" stopColor="#4fc776" />
        </linearGradient>
        <radialGradient id={glow} cx="0.5" cy="0.52" r="0.5">
          <stop offset="0" stopColor="#7dffb0" stopOpacity="0.5" />
          <stop offset="1" stopColor="#7dffb0" stopOpacity="0" />
        </radialGradient>
      </defs>
      <polygon
        points="88,48 68,82.6 28,82.6 8,48 28,13.4 68,13.4"
        fill={`url(#${plate})`}
        stroke={`url(#${rim})`}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <polygon
        points="83,48 65.5,78.3 30.5,78.3 13,48 30.5,17.7 65.5,17.7"
        fill="none"
        stroke="#8be79e"
        strokeOpacity="0.14"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <circle cx="48" cy="49" r="29" stroke="#ffffff" strokeOpacity="0.09" strokeWidth="1" />
      <circle cx="48" cy="49" r="25.5" stroke="#8be79e" strokeOpacity="0.18" strokeWidth="0.8" strokeDasharray="2.5 4" />
      <circle cx="48" cy="49" r="24" fill={`url(#${glow})`} />
      {/* faceted frog head */}
      <path
        d="M26 52 L27 42 L30 33 L37 30.5 L42 35.5 L48 37 L54 35.5 L59 30.5 L66 33 L69 42 L70 52 L60 61 L48 63.5 L36 61 Z"
        fill={`url(#${frog})`}
        stroke="#d9c66b"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M42 35.5 L48 47 L54 35.5 M48 47 L48 63.5 M27 42 L42 35.5 M69 42 L54 35.5 M26 52 L48 47 L70 52"
        stroke="#d9c66b"
        strokeOpacity="0.32"
        strokeWidth="0.7"
        fill="none"
      />
      <circle cx="36" cy="37" r="4.4" fill="#0b100f" />
      <circle cx="60" cy="37" r="4.4" fill="#0b100f" />
      <ellipse cx="36" cy="37" rx="1.15" ry="3" fill="#8be79e" />
      <ellipse cx="60" cy="37" rx="1.15" ry="3" fill="#8be79e" />
      <circle cx="44.5" cy="48.5" r="0.9" fill="#0b100f" fillOpacity="0.75" />
      <circle cx="51.5" cy="48.5" r="0.9" fill="#0b100f" fillOpacity="0.75" />
      <path
        d="M32 53.5 Q48 57 64 53.5"
        stroke="#0b100f"
        strokeOpacity="0.5"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M34 69.5 q14 4 28 0"
        stroke="#8be79e"
        strokeOpacity="0.4"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
