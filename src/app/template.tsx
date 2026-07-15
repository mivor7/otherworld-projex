// Remounts on every navigation — gives each page a quiet entrance.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
