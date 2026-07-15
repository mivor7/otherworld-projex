import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { InteractiveFX, ScrollProgress } from "@/components/fx";

export const metadata: Metadata = {
  metadataBase: new URL("https://otherworldprojex.com"),
  title: "Other World Projex — $RIBBIT Bounty Arcade",
  description:
    "Decentralized gaming on Solana. Burn $RIBBIT to play provably-fair games, bid in the auction house, and hunt bounties. One transparent treasury.",
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
      "Token holders become bounty hunters. The hunt is always open.",
    images: ["/og.png"],
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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] btn btn-primary"
        >
          Skip to content
        </a>
        <Providers>
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
