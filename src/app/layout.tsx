import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { StaleBundleReload } from "@/components/stale-bundle-reload";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { InteractiveFX, ScrollProgress } from "@/components/fx";
import { PwaRegister } from "@/components/pwa-register";
import { VaultIntro } from "@/components/vault-intro";

export const metadata: Metadata = {
  metadataBase: new URL("https://otherworldprojex.xyz"),
  title: "Other World Projex — $RIBBIT Bounty Arcade",
  description:
    "Decentralized gaming on Solana. Turn $RIBBIT into credits — part burned forever — play provably-fair games, bid in the auction house, and hunt bounties that pay automatically. One transparent treasury.",
  openGraph: {
    title: "Other World Projex — $RIBBIT Bounty Arcade",
    description:
      "Token holders become bounty hunters. Provably-fair games, an auction house and bounty boards — one transparent treasury on Solana.",
    siteName: "Other World Projex",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Other World Projex — $RIBBIT Bounty Arcade",
    description:
      "Token holders become bounty hunters. Provably fair, paid in $RIBBIT.",
    images: ["/og.png"],
  },
  // Installed-PWA chrome on iOS (Android reads the manifest).
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OWP",
  },
};

export const viewport = {
  themeColor: "#05090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the pre-paint gate script below adds
    // data-intro to <html> before React hydrates (same pattern as no-flash
    // theme scripts) — an expected, deliberate attribute mismatch.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        {/* Vault-intro gate. Runs synchronously before first paint: on a
            first homepage visit this session (and without reduced-motion),
            it flags <html data-intro="1"> so the server-rendered overlay is
            visible from the very first frame — no flash of the page, no
            waiting for hydration. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(location.pathname==="/"&&!sessionStorage.getItem("owp-intro")&&!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.setAttribute("data-intro","1");sessionStorage.setItem("owp-intro","1")}}catch(e){}`,
          }}
        />
        {/* The vault-intro overlay lives HERE — in the layout's first streamed
            chunk — not in the homepage, whose chunk waits on treasury RPC + DB
            aggregates. In the page it painted seconds late (homepage flash,
            then doors). The pathname gate in the script above still makes it
            homepage-only; on other routes data-intro is never set and CSS
            keeps it display:none. */}
        <VaultIntro />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] btn btn-primary"
        >
          Skip to content
        </a>
        <Providers>
          <StaleBundleReload />
          <PwaRegister />
          <InteractiveFX />
          <ScrollProgress />
          <Navbar />
          <main id="main" className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pb-24">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
