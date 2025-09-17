// app/questions/page.tsx
import Link from "next/link";
import { loadEnglishRaw, type Section } from "@/lib/english";
import { loadMathRaw } from "@/lib/math";
import StatusFilterClient from "./StatusFilterClient";
import DifficultyFilterClient from "./DifficultyFilterClient";

type SearchParams = {
  difficulty?: string;
  status?: string;
};

/** Minimal shape we actually use from the raw rows */
type RawRow = {
  difficulty?: string;
  domain_desc?: string;
  skill_desc?: string;
};

/* ---------- Helper Functions ---------- */
function getDifficultyCode(difficulty: string): string | null {
  if (!difficulty || difficulty === "All") return null;
  return difficulty === "Easy" ? "E" : difficulty === "Medium" ? "M" : "H";
}

async function getFilteredSections(
  subject: "english" | "math",
  difficulty?: string
): Promise<Section[]> {
  // Load raw data to do real filtering
  const rawData: RawRow[] =
    subject === "english"
      ? ((await loadEnglishRaw()) as unknown as RawRow[])
      : ((await loadMathRaw()) as unknown as RawRow[]);

  const difficultyCode = getDifficultyCode(difficulty || "");

  // Filter by difficulty if specified
  const filteredData: RawRow[] = difficultyCode
    ? rawData.filter((row) => row.difficulty?.trim() === difficultyCode)
    : rawData;

  // Build sections from filtered data
  const byDomain = new Map<string, Map<string, number>>();

  filteredData.forEach((row: RawRow) => {
    const domain = row.domain_desc?.trim();
    const skill = row.skill_desc?.trim();
    if (!domain || !skill) return;

    if (!byDomain.has(domain)) {
      byDomain.set(domain, new Map());
    }
    const skillMap = byDomain.get(domain)!;
    skillMap.set(skill, (skillMap.get(skill) || 0) + 1);
  });

  // Convert to Section format
  const sections: Section[] = [];
  byDomain.forEach((skillMap, domainName) => {
    const items = Array.from(skillMap.entries()).map(([skillName, count]) => ({
      name: skillName,
      count,
    }));
    sections.push({ name: domainName, items });
  });

  return sections;
}

/* ---------- UI Card ---------- */
function SectionCard({
  title,
  sections,
  currentDifficulty,
}: {
  title: "English" | "Math";
  sections: Section[];
  currentDifficulty?: string;
}) {
  const grandTotal = sections.flatMap((s) => s.items).reduce((sum, t) => sum + t.count, 0);

  if (grandTotal === 0) {
    return (
      <section className="group relative rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.6)] backdrop-blur">
        <div className="text-center py-8">
          <h2 className="text-lg font-semibold text-white/90 mb-2">{title}</h2>
          <p className="text-white/50 text-sm">
            No {currentDifficulty && currentDifficulty !== "All" ? currentDifficulty.toLowerCase() : ""} questions available
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="group relative rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.6)] backdrop-blur">
      <div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(600px 200px at 50% -10%, rgba(99,102,241,0.15), transparent 60%)" }}
      />
      <div className="relative">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white/90">{title}</h2>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
            {grandTotal}
          </span>
        </div>

        <div className="space-y-5">
          {sections.map((sec) => {
            const secTotal = sec.items.reduce((s, t) => s + t.count, 0);
            const subject = title.toLowerCase();

            return (
              <div key={sec.name}>
                <div className="mb-2 flex items-center justify-between">
                  <Link
                    href={{
                      pathname: `/questions/${subject}`,
                      query: {
                        domain: sec.name,
                        ...(currentDifficulty && currentDifficulty !== "All" && { difficulty: currentDifficulty }),
                      },
                    }}
                    className="text-[11px] font-medium uppercase tracking-wide text-white/50 hover:text-white/80"
                  >
                    {sec.name}
                  </Link>
                  <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
                    {secTotal}
                  </span>
                </div>

                <ul className="space-y-2">
                  {sec.items.map((t) => (
                    <li key={t.name}>
                      <Link
                        href={{
                          pathname: `/questions/${subject}`,
                          query: {
                            domain: sec.name,
                            skill: t.name,
                            ...(currentDifficulty && currentDifficulty !== "All" && { difficulty: currentDifficulty }),
                          },
                        }}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white/90 transition hover:border-indigo-400/30 hover:bg-indigo-400/10"
                      >
                        <span className="text-sm">{t.name}</span>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
                          {t.count}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------- Main Page ---------- */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { difficulty, status } = await searchParams;

  // Load filtered sections based on difficulty
  const [englishSections, mathSections] = await Promise.all([
    getFilteredSections("english", difficulty),
    getFilteredSections("math", difficulty),
  ]);

  return (
    <main className="min-h-screen bg-[#0b1020] text-white">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(900px_400px_at_20%_-10%,rgba(99,102,241,0.25),transparent_60%),radial-gradient(700px_300px_at_80%_-10%,rgba(34,197,94,0.18),transparent_60%)]" />
      </div>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold sm:text-4xl md:text-5xl">
            <span className="bg-gradient-to-r from-sky-400 via-indigo-300 to-fuchsia-300 bg-clip-text text-transparent">
              SAT Question Bank
            </span>
          </h1>
          <p className="mt-3 text-sm text-white/70">
            Browse by section, domain, and skill. Filter by difficulty level.
          </p>
        </header>

        {/* Filters */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur space-y-6">
          <h2 className="text-lg font-semibold text-white mb-4">Filters</h2>

          {/* Difficulty Filter */}
          <div>
            <h3 className="text-sm font-medium text-white/80 mb-3">Difficulty</h3>
            <div className="flex flex-wrap gap-2">
              {["All", "Easy", "Medium", "Hard"].map((option) => {
                const isSelected = (difficulty || "All") === option;

                // Build query params
                const query: Record<string, string> = {};
                if (status && status !== "All") {
                  query.status = status;
                }
                if (option !== "All") {
                  query.difficulty = option;
                }

                const href =
                  Object.keys(query).length > 0 ? `/questions?${new URLSearchParams(query).toString()}` : "/questions";

                return (
                  <Link
                    key={option}
                    href={href}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                      isSelected
                        ? option === "Easy"
                          ? "bg-green-600 text-white"
                          : option === "Medium"
                          ? "bg-yellow-600 text-white"
                          : option === "Hard"
                          ? "bg-red-600 text-white"
                          : "bg-slate-700 text-white"
                        : "bg-white/10 text-white/70 hover:bg-white/20 border border-white/20"
                    }`}
                  >
                    {option}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <h3 className="text-sm font-medium text-white/80 mb-3">Progress Status</h3>
            <StatusFilterClient currentStatus={status} currentDifficulty={difficulty} />
          </div>

          {/* Active Filters */}
          {((difficulty && difficulty !== "All") || (status && status !== "All")) && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-white/60">Active filters:</span>
              {difficulty && difficulty !== "All" && (
                <span className="px-2 py-1 bg-blue-600/20 text-blue-300 text-xs rounded-full border border-blue-600/30">
                  {difficulty}
                </span>
              )}
              {status && status !== "All" && (
                <span className="px-2 py-1 bg-purple-600/20 text-purple-300 text-xs rounded-full border border-purple-600/30">
                  {status}
                </span>
              )}
              <Link
                href="/questions"
                className="px-2 py-1 text-xs text-white/60 hover:text-white/80 border border-white/20 rounded-full hover:border-white/40 transition-all"
              >
                Clear all
              </Link>
            </div>
          )}
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <SectionCard title="English" sections={englishSections} currentDifficulty={difficulty} />
          <SectionCard title="Math" sections={mathSections} currentDifficulty={difficulty} />
        </div>

        {/* Quick actions */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/questions/english"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/90 transition hover:border-indigo-400/30 hover:bg-indigo-400/10"
          >
            Explore English
          </Link>
          <Link
            href="/questions/math"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/90 transition hover:border-emerald-400/30 hover:bg-emerald-400/10"
          >
            Explore Math
          </Link>
          <Link
            href="/tutor"
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-900/30 transition hover:bg-indigo-700"
          >
            Try AI Tutor
          </Link>
        </div>
      </div>
    </main>
  );
}
