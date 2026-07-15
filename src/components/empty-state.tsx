// Art-led empty states — a quiet piece of the vault instead of bare text.
export function EmptyState({
  image,
  title,
  hint,
  action,
}: {
  image: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel p-10 flex flex-col items-center text-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt=""
        className="w-24 h-24 object-cover rounded-full opacity-85"
        style={{
          border: "1px solid var(--hairline-strong)",
          boxShadow: "0 0 40px oklch(0.78 0.11 150 / 0.12)",
        }}
        loading="lazy"
      />
      <div className="font-medium tracking-tight mt-1">{title}</div>
      {hint && (
        <p className="text-fog text-sm max-w-xs leading-relaxed -mt-1">{hint}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
