"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";
import { fmtRibbit } from "@/lib/client-config";

type Application = {
  id: string;
  title: string;
  status: string;
  askRaw: string;
  createdAt: string;
  reviewNote: string | null;
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
      setMsg({ kind: "ok", text: "Application submitted — the team will review it soon." });
      setForm({ ...form, title: "", description: "", imageUrl: "" });
      loadMine();
    } else {
      setMsg({ kind: "err", text: data.error ?? "Submission failed" });
    }
    setBusy(false);
  };

  return (
    <div className="pt-10 max-w-2xl mx-auto">
      <SectionTitle
        kicker="Wing II — consignments"
        title="Consign a lot"
        desc="RIBBIT community members can put their own lots under the gavel — collectibles, 1/1s, merch, services. Approved consignments go live in the auction house with your wallet on record as seller."
      />

      {!me.signedIn ? (
        <Notice kind="info">Connect & sign in with your wallet to apply.</Notice>
      ) : (
        <form onSubmit={submit} className="panel panel-glow p-6 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-fog">Title</label>
            <input
              className="input mt-1"
              required
              minLength={3}
              maxLength={80}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Golden Frog 1/1 NFT"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-fog">Description</label>
            <textarea
              className="input mt-1 min-h-28"
              required
              minLength={10}
              maxLength={2000}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What is it, why is it cool, how will it be delivered to the winner…"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-fog">Category</label>
              <select
                className="input mt-1"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="collectible">Collectible</option>
                <option value="nft">NFT</option>
                <option value="merch">Merch</option>
                <option value="service">Service</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-fog">
                Starting bid ($RIBBIT)
              </label>
              <input
                type="number"
                className="input mt-1"
                required
                min={1}
                value={form.askRibbit}
                onChange={(e) => setForm({ ...form, askRibbit: Number(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-fog">
              Image URL (optional)
            </label>
            <input
              className="input mt-1"
              type="url"
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              placeholder="https://…"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-fog">
              Contact (optional — X / Discord)
            </label>
            <input
              className="input mt-1"
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

      {mine.length > 0 && (
        <div className="panel p-5 mt-6">
          <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-fog">
            Your applications
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {mine.map((a) => (
                <tr key={a.id} className="table-row">
                  <td className="py-2 pr-2">{a.title}</td>
                  <td className="py-2 pr-2 stat-number">{fmtRibbit(a.askRaw)}</td>
                  <td className="py-2 text-right">
                    <span
                      className={`badge ${
                        a.status === "approved"
                          ? "badge-live"
                          : a.status === "rejected"
                            ? ""
                            : "badge-gold"
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
