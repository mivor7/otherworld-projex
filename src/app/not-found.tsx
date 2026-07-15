import Link from "next/link";
import { SealMark } from "@/components/seal";

export default function NotFound() {
  return (
    <div className="pt-32 flex flex-col items-center text-center gap-5 px-4">
      <SealMark size={84} />
      <div>
        <div className="kicker mb-2">404 — off the map</div>
        <h1 className="text-[1.7rem] mb-3">This pond doesn’t exist.</h1>
        <p className="text-fog max-w-sm leading-relaxed">
          Whatever you were hunting isn’t in this wing of the Other World.
          The lily pad may have been moved or settled.
        </p>
      </div>
      <div className="flex gap-2.5">
        <Link href="/" className="btn btn-primary">
          Back to the house
        </Link>
        <Link href="/auctions" className="btn btn-ghost">
          Live lots
        </Link>
      </div>
    </div>
  );
}
