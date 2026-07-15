import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "Other World Projex — $RIBBIT Bounty Arcade",
  description:
    "Decentralized gaming on Solana. Burn $RIBBIT to play provably-fair games, bid in the auction house, and hunt bounties. One transparent treasury.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Providers>
          <Navbar />
          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pb-24">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
