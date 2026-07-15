import { SealMark } from "@/components/seal";

export default function Loading() {
  return (
    <div className="pt-40 flex flex-col items-center gap-4">
      <div className="animate-pulse">
        <SealMark size={72} />
      </div>
      <p className="kicker">Entering the house…</p>
    </div>
  );
}
