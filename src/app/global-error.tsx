"use client";

import { useEffect } from "react";

// Catches errors in the root layout itself (very rare - NavBar/globals.css
// level failures). Next.js requires this to render its own <html>/<body>
// since it replaces the root layout entirely when triggered.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 px-6 text-center text-white">
        <div>
          <h1 className="text-3xl font-bold">AIPrep hit a snag</h1>
          <p className="mt-2 max-w-sm text-slate-400">
            Please reload the page. If this keeps happening, try again in a few minutes.
          </p>
        </div>
        <button
          onClick={reset}
          className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:scale-105"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
