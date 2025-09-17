import { loadMathRaw } from "@/lib/math";
import QuestionViewer, { type Question } from "@/components/QuestionViewer";

type Search = {
  domain?: string;
  skill?: string;
  difficulty?: "All" | "Easy" | "Medium" | "Hard" | string;
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { domain, skill, difficulty } = await searchParams;

  // Load and type rows
  const rows = (await loadMathRaw()) as unknown as Question[];

  const filtered = rows.filter((r) => {
    const d = r.domain_desc?.trim();
    const s = r.skill_desc?.trim();
    const diff = r.difficulty?.trim();

    let difficultyMatch = true;
    if (difficulty && difficulty !== "All") {
      const difficultyCode =
        difficulty === "Easy" ? "E" :
        difficulty === "Medium" ? "M" :
        difficulty === "Hard" ? "H" :
        difficulty;
      difficultyMatch = diff === difficultyCode;
    }

    return (
      (domain ? d === domain : true) &&
      (skill ? s === skill : true) &&
      difficultyMatch
    );
  });

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <QuestionViewer
          rows={filtered}
          subject="math"
          domain={domain}
          skill={skill}
          difficulty={difficulty}
        />
      </div>
    </main>
  );
}
