import type { NextConfig } from "next";

// Sent on every response. This is a wallet-connected, real-money site: the
// one attack these headers exist for is another origin framing a table or the
// admin panel and tricking a signed-in player into clicking through it.
// The CSP is deliberately narrow — it sets no script-src or connect-src, so
// wallet adapters, RPC endpoints, and the inline intro gate keep working.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
