export default function Loading() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-slate-950">
      <div className="flex items-center gap-3 text-slate-400">
        <div className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" style={{ animationDelay: "0ms" }} />
        <div className="h-2 w-2 animate-pulse rounded-full bg-purple-400" style={{ animationDelay: "150ms" }} />
        <div className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}
