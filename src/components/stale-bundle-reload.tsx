"use client";

// After a redeploy, an already-open tab references JS chunks that no longer
// exist — buttons silently do nothing and the app looks broken. Detect the
// chunk-load failure and reload ONCE to pick up the new build (guarded by
// sessionStorage so a genuinely broken deploy can't reload-loop).
import { useEffect } from "react";

const STALE_RE =
  /ChunkLoadError|Loading chunk .* failed|error loading dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed/i;

export function StaleBundleReload() {
  useEffect(() => {
    const onProblem = (e: ErrorEvent | PromiseRejectionEvent) => {
      const msg = String(
        (e as PromiseRejectionEvent).reason?.message ??
          (e as ErrorEvent).message ??
          (e as PromiseRejectionEvent).reason ??
          ""
      );
      if (!STALE_RE.test(msg)) return;
      const key = "owp-stale-reload";
      if (sessionStorage.getItem(key)) return; // one attempt per session
      sessionStorage.setItem(key, "1");
      location.reload();
    };
    window.addEventListener("error", onProblem);
    window.addEventListener("unhandledrejection", onProblem);
    return () => {
      window.removeEventListener("error", onProblem);
      window.removeEventListener("unhandledrejection", onProblem);
    };
  }, []);
  return null;
}
