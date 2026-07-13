function SectionCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="h-5 w-24 animate-pulse rounded bg-white/10" />
        <div className="h-5 w-10 animate-pulse rounded-full bg-white/10" />
      </div>
      <div className="space-y-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <div className="mb-2 h-3 w-32 animate-pulse rounded bg-white/10" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-9 w-full animate-pulse rounded-lg bg-white/5" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <main className="min-h-screen bg-[#0b1020] text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 text-center">
          <div className="mx-auto h-10 w-72 animate-pulse rounded-lg bg-white/10" />
        </div>
        <div className="mb-8 h-32 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <SectionCardSkeleton />
          <SectionCardSkeleton />
        </div>
      </div>
    </main>
  );
}
