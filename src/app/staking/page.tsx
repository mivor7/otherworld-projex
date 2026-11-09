import Link from "next/link";
import { SectionTitle } from "@/components/ui";

export default function StakingPage() {
  return (
    <div className="pt-10 max-w-xl">
      <SectionTitle
        kicker="Not offered"
        title="No staking pool"
        desc="Other World Projex does not run a staking pool, and it does not trade the house wallet to move the $OWP price. Deposit $OWP, play and bid from your balance, and withdraw anytime. On Frog Flip and Pond Dice the only cut is a 4% house edge."
      />
      <Link href="/whitepaper" className="btn btn-ghost">
        Read the whitepaper
      </Link>
    </div>
  );
}
