import Link from "next/link";
import { CLIENT_CONFIG } from "@/lib/client-config";
import { Logo } from "./logo";

export function Footer() {
  return (
    <footer className="border-t border-edge mt-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid gap-8 md:grid-cols-3 text-sm">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Logo size={28} />
            <span className="font-bold">Other World Projex</span>
          </div>
          <p className="text-fog leading-relaxed">
            A decentralized bounty arcade on Solana. Burn $RIBBIT to play,
            bid in community auctions, hunt bounties. One transparent treasury.
          </p>
        </div>
        <div>
          <h4 className="font-semibold mb-3 text-frost">Explore</h4>
          <ul className="space-y-2 text-fog">
            <li><Link className="hover:text-neon" href="/games">Games</Link></li>
            <li><Link className="hover:text-neon" href="/auctions">Auction House</Link></li>
            <li><Link className="hover:text-neon" href="/bounties">Bounties</Link></li>
            <li><Link className="hover:text-neon" href="/treasury">Treasury</Link></li>
            <li><Link className="hover:text-neon" href="/fairness">Provable Fairness</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-3 text-frost">$RIBBIT</h4>
          <ul className="space-y-2 text-fog">
            <li>
              <a className="hover:text-neon" href={CLIENT_CONFIG.pumpFunUrl} target="_blank" rel="noreferrer">
                Buy on pump.fun ↗
              </a>
            </li>
            <li>
              <a className="hover:text-neon" href={CLIENT_CONFIG.xUrl} target="_blank" rel="noreferrer">
                @OWProjex on X ↗
              </a>
            </li>
            <li>
              <a
                className="hover:text-neon break-all"
                href={`https://solscan.io/token/${CLIENT_CONFIG.ribbitMint}`}
                target="_blank"
                rel="noreferrer"
              >
                Mint: {CLIENT_CONFIG.ribbitMint.slice(0, 8)}… ↗
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-edge py-4 text-center text-xs text-fog/70 px-4">
        Games are for entertainment. $RIBBIT is a memecoin with no promise of financial return.
        Play responsibly — never burn more than you can afford to lose.
      </div>
    </footer>
  );
}
