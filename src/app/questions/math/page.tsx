import { loadMathRaw } from "@/lib/math";
import QuestionViewer from "@/components/QuestionViewer";

type Search = { 
  domain?: string; 
  skill?: string; 
  difficulty?: string; // Add difficulty parameter
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { domain, skill, difficulty } = await searchParams;
  const rows = await loadMathRaw();

  const filtered = rows.filter((r) => {
    const d = r.domain_desc?.trim();
    const s = r.skill_desc?.trim();
    const diff = r.difficulty?.trim();
    
    let difficultyMatch = true;
    if (difficulty) {
      const difficultyCode =
        difficulty === "Easy" ? "E" :
        difficulty === "Medium" ? "M" :
        difficulty === "Hard" ? "H" : difficulty;
      difficultyMatch = diff === difficultyCode;
    }
    
    return (domain ? d === domain : true) && 
           (skill ? s === skill : true) && 
           difficultyMatch;
  });

  return (
    <main className="min-h-screen bg-slate-950 text-white"> {/* ✨ fixed */}
      <div className="mx-auto max-w-5xl px-4 py-6">
        <QuestionViewer
          rows={filtered as any[]}
          subject="math"
          domain={domain}
          skill={skill}
          difficulty={difficulty}
        />
      </div>
    </main>
  );
}
