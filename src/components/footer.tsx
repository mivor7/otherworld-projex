import Link from "next/link";
import { CLIENT_CONFIG } from "@/lib/client-config";

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--hairline)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid gap-10 md:grid-cols-4 text-sm">
        <div className="md:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/art/logo-seal.jpg"
              alt=""
              className="w-8 h-8 rounded-md border object-cover"
              style={{ borderColor: "var(--hairline-strong)" }}
            />
            <span
              className="font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Other World Projex
            </span>
          </div>
          <p className="text-fog leading-relaxed max-w-sm">
            A decentralized bounty arcade on Solana. Burn $RIBBIT to play
            provably-fair games, bid in the auction house, hunt bounties —
            all against one transparent treasury.
          </p>
        </div>
        <div>
          <h4 className="kicker mb-4">The house</h4>
          <ul className="space-y-2.5 text-fog">
            <li><Link className="hover:text-frost transition-colors" href="/games">Arcade</Link></li>
            <li><Link className="hover:text-frost transition-colors" href="/auctions">Auction House</Link></li>
            <li><Link className="hover:text-frost transition-colors" href="/bounties">Bounties</Link></li>
            <li><Link className="hover:text-frost transition-colors" href="/treasury">Treasury</Link></li>
            <li><Link className="hover:text-frost transition-colors" href="/fairness">Provable fairness</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="kicker mb-4">$RIBBIT</h4>
          <ul className="space-y-2.5 text-fog">
            <li>
              <a className="hover:text-frost transition-colors" href={CLIENT_CONFIG.pumpFunUrl} target="_blank" rel="noreferrer">
                pump.fun ↗
              </a>
            </li>
            <li>
              <a className="hover:text-frost transition-colors" href={CLIENT_CONFIG.xUrl} target="_blank" rel="noreferrer">
                @OWProjex ↗
              </a>
            </li>
            <li>
              <a
                className="hover:text-frost transition-colors"
                href={`https://solscan.io/token/${CLIENT_CONFIG.ribbitMint}`}
                target="_blank"
                rel="noreferrer"
              >
                Mint record ↗
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div
        className="py-5 text-center text-xs px-4"
        style={{ borderTop: "1px solid var(--hairline)", color: "var(--text-dim)" }}
      >
        Games are for entertainment. $RIBBIT is a memecoin with no promise of financial
        return. Play responsibly — never burn more than you can afford to lose.
      </div>
    </footer>
  );
}
