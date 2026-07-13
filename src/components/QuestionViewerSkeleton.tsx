/**
 * Loading skeleton for the question-bank pages (/questions/english,
 * /questions/math). These are server components that read and parse a
 * multi-megabyte JSON file per request with no caching yet (see the
 * dataset-caching work), so first paint can take a moment - this fills
 * that gap with the real layout's shape instead of a blank page.
 */
export default function QuestionViewerSkeleton() {
  return (
    <div className="min-h-screen bg-[#0b1020] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-7 w-56 animate-pulse rounded-lg bg-white/10" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-9 w-20 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/10 bg-white p-6 shadow-xl">
          <div className="mb-6 h-5 w-40 animate-pulse rounded bg-zinc-200" />
          <div className="mb-8 space-y-3">
            <div className="h-4 w-full animate-pulse rounded bg-zinc-100" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-zinc-100" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-100" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 w-full animate-pulse rounded-xl bg-zinc-100" />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-12 w-12 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
