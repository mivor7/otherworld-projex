"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { PageHero } from "@/components/hero";
import { MatteMedia } from "@/components/matte-media";
import { Notice } from "@/components/ui";
import { fmtRibbit } from "@/lib/client-config";

type Application = {
  id: string;
  title: string;
  status: string;
  askRaw: string;
  createdAt: string;
  reviewNote: string | null;
};

const STEPS = [
  ["01", "Submit the lot", "Describe the item, set your opening bid, attach an image."],
  ["02", "House review", "The house checks authenticity, terms and category — usually within a day."],
  ["03", "Under the gavel", "Approved lots go live with your wallet on record as seller."],
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  collectible: "Collectible",
  nft: "NFT",
  merch: "Merch",
  service: "Service",
  other: "Other",
};

export default function ApplyPage() {
  const { me } = useSession();
  const [form, setForm] = useState({
    title: "",
    description: "",
    imageUrl: "",
    category: "collectible",
    askRibbit: 1000,
    contact: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [mine, setMine] = useState<Application[]>([]);

  const loadMine = () => {
    fetch("/api/listings/apply")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => Array.isArray(rows) && setMine(rows))
      .catch(() => {});
  };
  useEffect(() => {
    if (me.signedIn) loadMine();
  }, [me.signedIn]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/listings/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, askRibbit: Number(form.askRibbit) }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg({ kind: "ok", text: "Consignment submitted — the house will review it soon." });
      setForm({ ...form, title: "", description: "", imageUrl: "" });
      loadMine();
    } else {
      setMsg({ kind: "err", text: data.error ?? "Submission failed" });
    }
    setBusy(false);
  };

  return (
    <div className="pt-6">
      <PageHero
        compact
        image="/art/art-empty-chest.jpg"
        imagePosition="72% 45%"
        kicker="Wing II — consignments"
        badge="Community sellers welcome"
        title="Consign a"
        titleAccent="lot"
        subtitle="Put your own items under the gavel — collectibles, 1/1 NFTs, merch, services. Approved consignments go live in the auction house with your wallet on record as seller."
      />

      {/* Process */}
      <div className="grid sm:grid-cols-3 gap-4 mt-8">
        {STEPS.map(([n, title, desc]) => (
          <div key={n} className="panel panel-hover p-5">
            <div className="mono text-xs text-neon mb-2.5">{n}</div>
            <div className="font-medium tracking-tight mb-1">{title}</div>
            <p className="text-fog text-[0.85rem] leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_330px] gap-6 mt-6">
        {/* Form */}
        {!me.signedIn ? (
          <div className="h-fit">
            <Notice kind="info">Connect &amp; sign in with your wallet to consign a lot.</Notice>
          </div>
        ) : (
          <form onSubmit={submit} className="panel panel-glow panel-etched p-6 space-y-4 h-fit">
            <div>
              <label className="kicker !text-[0.6rem]">Title</label>
              <input
                className="input mt-1.5"
                required
                minLength={3}
                maxLength={80}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Golden Frog medallion — 1/1"
              />
            </div>
            <div>
              <label className="kicker !text-[0.6rem]">Description</label>
              <textarea
                className="input mt-1.5 min-h-28"
                required
                minLength={10}
                maxLength={2000}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What it is, condition/edition, and how the winner receives it (shipping regions, claim window)…"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="kicker !text-[0.6rem]">Category</label>
                <select
                  className="input mt-1.5"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="kicker !text-[0.6rem]">Opening bid ($RIBBIT)</label>
                <input
                  type="number"
                  className="input mt-1.5"
                  required
                  min={1}
                  value={form.askRibbit}
                  onChange={(e) => setForm({ ...form, askRibbit: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <label className="kicker !text-[0.6rem]">Image URL</label>
              <input
                className="input mt-1.5"
                type="url"
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                placeholder="https://… (a clear photo sells the lot — see the preview)"
              />
            </div>
            <div>
              <label className="kicker !text-[0.6rem]">Contact (optional — X / Discord)</label>
              <input
                className="input mt-1.5"
                maxLength={120}
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
                placeholder="@yourhandle"
              />
            </div>
            <button className="btn btn-portal w-full py-3" disabled={busy}>
              {busy ? "Submitting…" : "Submit for review"}
            </button>
            {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          </form>
        )}

        {/* Live preview + rules */}
        <aside className="space-y-4 lg:sticky lg:top-24 h-fit">
          <div>
            <div className="kicker mb-2.5">Live preview — how bidders see it</div>
            <div className="lot-card">
              <div className="card-media">
                <MatteMedia src={form.imageUrl || "/art/art-empty-chest.jpg"} />
                <span className="badge badge-portal absolute top-2 right-2">preview</span>
              </div>
              <div className="card-body">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="badge">{form.category}</span>
                  <span className="badge badge-portal">consigned</span>
                </div>
                <h3 className="mt-1 line-clamp-2">
                  {form.title || "Your lot title"}
                </h3>
                <div className="card-price-row">
                  <div>
                    <div className="card-price-label">Opening bid</div>
                    <div className="price text-neon">
                      {Number(form.askRibbit || 0).toLocaleString()}{" "}
                      <span className="text-fog text-xs font-normal">RIBBIT</span>
                    </div>
                  </div>
                  <div className="card-price-label">0 bids</div>
                </div>
              </div>
            </div>
          </div>

          <div className="panel p-5">
            <div className="kicker mb-3">House rules</div>
            <ul className="text-[0.85rem] text-fog space-y-2.5 leading-relaxed">
              <li>
                <span className="text-frost font-medium">Whole items only.</span>{" "}
                One lot = one item. No fractional shares.
              </li>
              <li>
                <span className="text-frost font-medium">Physical items:</span>{" "}
                state shipping regions and a claim window in the description.
              </li>
              <li>
                <span className="text-frost font-medium">Settlement:</span> the
                winner’s $RIBBIT is escrowed by the house; you coordinate
                delivery, the house releases proceeds.
              </li>
              <li>
                <span className="text-frost font-medium">Up to 3</span> pending
                consignments per wallet.
              </li>
            </ul>
          </div>
        </aside>
      </div>

      {/* My consignments */}
      {mine.length > 0 && (
        <div className="panel p-5 mt-6">
          <div className="kicker mb-4">Your consignments</div>
          <table className="w-full text-sm">
            <tbody>
              {mine.map((a) => (
                <tr key={a.id} className="table-row">
                  <td className="py-2 pr-2">{a.title}</td>
                  <td className="py-2 pr-2 stat-number text-right">{fmtRibbit(a.askRaw)}</td>
                  <td className="py-2 pl-3 text-right">
                    <span
                      className={`badge ${
                        a.status === "approved"
                          ? "badge-live"
                          : a.status === "pending"
                            ? "badge-gold"
                            : ""
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
