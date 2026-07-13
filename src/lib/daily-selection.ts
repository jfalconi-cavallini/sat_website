import type { EnglishRow } from "@/lib/english";
import type { MathRow } from "@/lib/math";

export type DailyQuestion = (EnglishRow | MathRow) & { __source: "English" | "Math" };

export function getTodayKey(): string {
  return new Date().toISOString().split("T")[0];
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededPick<T>(seedStr: string, arr: T[], k: number): T[] {
  if (!arr.length) return [];
  const seed = seedStr.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const rng = mulberry32(seed);
  return [...arr].sort(() => rng() - 0.5).slice(0, Math.min(k, arr.length));
}

/**
 * Deterministically picks the same 10 questions (5 English + 5 Math) for every
 * user on a given calendar date. __source is assigned directly from which
 * dataset each row came from, since the caller already knows that - no
 * heuristic subject-guessing needed here (unlike the old client-side version,
 * which had to infer it defensively from an already-merged, less trustworthy
 * payload).
 */
export function pickDailyQuestions(
  dateKey: string,
  englishRows: EnglishRow[],
  mathRows: MathRow[]
): DailyQuestion[] {
  const sortByDifficulty = <T extends { difficulty?: string }>(rows: T[]): T[] => {
    const easy = rows.filter((r) => r.difficulty === "E");
    const medium = rows.filter((r) => r.difficulty === "M");
    const hard = rows.filter((r) => r.difficulty === "H");
    return [...easy, ...medium, ...hard];
  };

  const selectedEnglish = seededPick(dateKey + "-english", sortByDifficulty(englishRows), 5).map(
    (r): DailyQuestion => ({ ...r, __source: "English" })
  );
  const selectedMath = seededPick(dateKey + "-math", sortByDifficulty(mathRows), 5).map(
    (r): DailyQuestion => ({ ...r, __source: "Math" })
  );

  const daily: DailyQuestion[] = [];
  const maxLen = Math.max(selectedEnglish.length, selectedMath.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < selectedEnglish.length) daily.push(selectedEnglish[i]);
    if (i < selectedMath.length) daily.push(selectedMath[i]);
  }
  return daily.slice(0, 10);
}
