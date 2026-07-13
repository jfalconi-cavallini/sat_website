import fs from "node:fs/promises";
import path from "node:path";

export type MathRow = {
  id: string;
  domain_desc: string;
  skill_desc: string;
  difficulty?: "E" | "M" | "H" | string;
  type?: "mcq" | "spr" | string;
  stem?: string;
  stem_html?: string;
  stimulus?: string;
  stimulus_html?: string;
  rationale?: string;
  rationale_html?: string;
  choices?: { key: string; text?: string; text_html?: string; correct?: boolean }[];
  correct_letters?: string | string[];
  answer?: string;
};

// Cache the parsed dataset for the lifetime of the server process instead of
// re-reading and re-parsing an ~16MB file on every request. The data file is
// static (checked into git, never changes at runtime), so there's no
// invalidation concern. Caching the promise itself (not just the resolved
// value) means concurrent requests during the very first load also share one
// read instead of racing to read the file multiple times.
let cachedRows: Promise<MathRow[]> | null = null;

export async function loadMathRaw(): Promise<MathRow[]> {
  if (!cachedRows) {
    cachedRows = (async () => {
      const file = path.join(process.cwd(), "data", "math_qa_normalized.json");
      const raw = await fs.readFile(file, "utf8");
      return JSON.parse(raw) as MathRow[];
    })().catch((err) => {
      cachedRows = null; // don't cache a failed read - let the next call retry
      throw err;
    });
  }
  return cachedRows;
}
