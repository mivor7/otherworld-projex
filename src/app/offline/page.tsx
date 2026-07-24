// Static offline fallback — the ONLY page the service worker ever serves from
// cache (navigations are network-only so a deploy can never be masked by a
// stale cached shell). Keep this self-contained: no client fetches, no
// live data.
export const metadata = {
  title: "Offline — Other World Projex",
};

export default function OfflinePage() {
  return (
    <div className="pt-24 max-w-md mx-auto text-center">
      <div className="text-5xl mb-4" aria-hidden>
        🐸
      </div>
      <h1 className="text-[1.4rem] mb-2">The pond is unreachable</h1>
      <p className="text-fog text-sm leading-relaxed mb-6">
        You&apos;re offline — the tables, bounties and balances need a live
        connection. Nothing is lost: reconnect and pick up where you left off.
      </p>
      {/* Deliberately a full document load, not an SPA <Link> — "try again"
          must prove the network is back with a fresh navigation. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="btn btn-primary">
        Try again
      </a>
    </div>
  );
}
