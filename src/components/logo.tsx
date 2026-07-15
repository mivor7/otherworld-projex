// The OWP mark: a frog surfacing inside a glowing otherworld portal.
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-label="Other World Projex"
    >
      <defs>
        <linearGradient id="owp-ring" x1="0" y1="0" x2="96" y2="96">
          <stop offset="0%" stopColor="#36f581" />
          <stop offset="60%" stopColor="#36f581" />
          <stop offset="100%" stopColor="#a586ff" />
        </linearGradient>
        <radialGradient id="owp-void" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#0e2a1c" />
          <stop offset="100%" stopColor="#05090b" />
        </radialGradient>
      </defs>
      {/* portal */}
      <circle cx="48" cy="48" r="42" fill="url(#owp-void)" />
      <circle cx="48" cy="48" r="42" stroke="url(#owp-ring)" strokeWidth="4" />
      <circle
        cx="48"
        cy="48"
        r="35"
        stroke="#a586ff"
        strokeOpacity="0.25"
        strokeWidth="1.5"
        strokeDasharray="3 6"
      />
      {/* frog surfacing: eyes above the waterline */}
      <path
        d="M20 58c0-6 5-10 9-10 3 0 4 2 6 2h26c2 0 3-2 6-2 4 0 9 4 9 10v6c0 3-2 5-5 5H25c-3 0-5-2-5-5v-6z"
        fill="#36f581"
      />
      <circle cx="31" cy="44" r="9" fill="#36f581" />
      <circle cx="65" cy="44" r="9" fill="#36f581" />
      <circle cx="31" cy="44" r="4" fill="#05090b" />
      <circle cx="65" cy="44" r="4" fill="#05090b" />
      <circle cx="32.5" cy="42.5" r="1.4" fill="#7dffb0" />
      <circle cx="66.5" cy="42.5" r="1.4" fill="#7dffb0" />
      {/* ripple */}
      <path
        d="M14 70c6 3 12 3 17 0M65 70c6 3 12 3 17 0"
        stroke="#36f581"
        strokeOpacity="0.5"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
