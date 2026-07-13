import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 bg-slate-950 px-6 text-center text-white">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600">
        <Compass className="h-7 w-7 text-white" />
      </div>
      <div>
        <h1 className="text-3xl font-bold">Page not found</h1>
        <p className="mt-2 max-w-sm text-slate-400">
          That page doesn&apos;t exist, or the link is out of date. Let&apos;s get you back to practicing.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:scale-105"
        >
          Go home
        </Link>
        <Link
          href="/questions"
          className="rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/90 transition hover:border-indigo-400/40 hover:bg-indigo-400/10"
        >
          Browse questions
        </Link>
      </div>
    </div>
  );
}
