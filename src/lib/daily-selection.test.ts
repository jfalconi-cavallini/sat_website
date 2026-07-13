import { describe, it, expect } from "vitest";
import { pickDailyQuestions, getTodayKey } from "./daily-selection";
import type { EnglishRow } from "./english";
import type { MathRow } from "./math";

function makeRows<T extends { id: string; difficulty?: string }>(
  count: number,
  factory: (i: number) => T
): T[] {
  return Array.from({ length: count }, (_, i) => factory(i));
}

const englishRows: EnglishRow[] = makeRows(20, (i) => ({
  id: `e-${i}`,
  domain_desc: "Craft and Structure",
  skill_desc: "Words in Context",
  difficulty: i % 3 === 0 ? "E" : i % 3 === 1 ? "M" : "H",
}));

const mathRows: MathRow[] = makeRows(20, (i) => ({
  id: `m-${i}`,
  domain_desc: "Algebra",
  skill_desc: "Linear equations",
  difficulty: i % 3 === 0 ? "E" : i % 3 === 1 ? "M" : "H",
}));

describe("getTodayKey", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(getTodayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("pickDailyQuestions", () => {
  it("picks exactly 10 questions when enough rows exist", () => {
    const picks = pickDailyQuestions("2026-07-13", englishRows, mathRows);
    expect(picks).toHaveLength(10);
  });

  it("alternates English/Math source, 5 of each", () => {
    const picks = pickDailyQuestions("2026-07-13", englishRows, mathRows);
    const english = picks.filter((q) => q.__source === "English");
    const math = picks.filter((q) => q.__source === "Math");
    expect(english).toHaveLength(5);
    expect(math).toHaveLength(5);
  });

  it("tags __source directly from the source array, not by inspecting content", () => {
    // Regression guard: the old client-side version had to *guess* subject
    // from domain/content text. The server-side version doesn't need to
    // guess - a row from englishRows is English, full stop.
    const picks = pickDailyQuestions("2026-07-13", englishRows, mathRows);
    for (const q of picks) {
      if (q.id.startsWith("e-")) expect(q.__source).toBe("English");
      if (q.id.startsWith("m-")) expect(q.__source).toBe("Math");
    }
  });

  it("is deterministic: the same date always produces the same selection", () => {
    const a = pickDailyQuestions("2026-07-13", englishRows, mathRows);
    const b = pickDailyQuestions("2026-07-13", englishRows, mathRows);
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });

  it("different dates produce different selections", () => {
    const a = pickDailyQuestions("2026-07-13", englishRows, mathRows);
    const b = pickDailyQuestions("2026-07-14", englishRows, mathRows);
    expect(a.map((q) => q.id)).not.toEqual(b.map((q) => q.id));
  });

  it("returns fewer than 10 gracefully when the pool is too small, instead of throwing", () => {
    const picks = pickDailyQuestions("2026-07-13", englishRows.slice(0, 2), mathRows.slice(0, 2));
    expect(picks).toHaveLength(4);
  });

  it("returns an empty array for empty input", () => {
    expect(pickDailyQuestions("2026-07-13", [], [])).toEqual([]);
  });
});
