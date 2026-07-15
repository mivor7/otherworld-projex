export function LotCardSkeleton() {
  return (
    <div className="lot-card" aria-hidden>
      <div className="card-media shimmer !rounded-none" />
      <div className="card-body">
        <div className="shimmer h-4 w-2/5" />
        <div className="shimmer h-5 w-4/5" />
        <div className="card-price-row">
          <div className="shimmer h-6 w-24" />
          <div className="shimmer h-4 w-14" />
        </div>
      </div>
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div className="panel p-6 space-y-3" aria-hidden>
      <div className="shimmer h-4 w-1/3" />
      <div className="shimmer h-6 w-2/3" />
      <div className="shimmer h-4 w-1/2" />
    </div>
  );
}
