import type { ReactNode } from "react";
import { Ticker } from "./ticker";
import { HeroScene } from "./hero-scene";

export function LivePulse({ label = "Live" }: { label?: string }) {
  return (
    <span className="badge badge-live">
      <span className="live-dot" aria-hidden />
      {label}
    </span>
  );
}

/**
 * Editorial art banner: vault imagery under a layered overlay, fine inner
 * frame, optional brand lockup and inline metrics. The house look.
 */
export function PageHero({
  kicker,
  title,
  titleAccent,
  subtitle,
  actions,
  badge,
  image = "/art/hero-atelier.jpg",
  imagePosition,
  compact = false,
  brand = false,
  interactive = false,
  stats,
}: {
  kicker?: string;
  title: ReactNode;
  titleAccent?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  badge?: string | false;
  image?: string;
  imagePosition?: string;
  compact?: boolean;
  brand?: boolean;
  interactive?: boolean;
  stats?: { value: string; label: string }[];
}) {
  return (
    <section className={`page-hero${compact ? " page-hero--compact" : ""}`}>
      {interactive ? (
        <HeroScene image={image} imagePosition={imagePosition} />
      ) : (
        <div
          className="page-hero-bg"
          style={{
            backgroundImage: `url(${image})`,
            ...(imagePosition ? { backgroundPosition: imagePosition } : {}),
          }}
        />
      )}
      <div className="page-hero-overlay" />
      <div className="page-hero-frame" aria-hidden />

      <div className="page-hero-inner">
        <div className="page-hero-content">
          <div className="page-hero-topline">
            {kicker && <p className="kicker">{kicker}</p>}
            {badge && <LivePulse label={badge} />}
          </div>

          <h1 className="page-hero-title">
            {title}
            {titleAccent != null && (
              <>
                {" "}
                <span className="neon-text">{titleAccent}</span>
              </>
            )}
          </h1>

          {subtitle && <div className="page-hero-sub">{subtitle}</div>}
          {actions && <div className="page-hero-actions">{actions}</div>}

          {stats && stats.length > 0 && (
            <div className="page-hero-stats">
              {stats.map((s) => (
                <div key={s.label}>
                  <strong>
                    <Ticker text={s.value} />
                  </strong>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {brand && (
          <aside className="page-hero-brand" aria-hidden>
            <div className="page-hero-brand-card">
              <div className="page-hero-brand-mark">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/art/ribbit-mark.jpg" alt="" />
              </div>
              <div>
                <span className="page-hero-brand-name">$RIBBIT</span>
                <span className="page-hero-brand-line">Settlement currency</span>
              </div>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
