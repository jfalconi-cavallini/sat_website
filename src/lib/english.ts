import fs from "node:fs/promises";
import path from "node:path";

// Used by app/questions/page.tsx's domain -> skill browse index
export type Topic = { name: string; count: number };
export type Section = { name: string; items: Topic[] };

export type EnglishRow = {
  id: string;
  domain_desc: string;
  skill_desc: string;
  difficulty?: "E" | "M" | "H" | string;
  type?: "mcq" | "spr" | string;
  stimulus?: string;
  stem?: string;
  stimulus_html?: string;
  stem_html?: string;
  choices?: { key: string; text: string; text_html?: string; correct?: boolean }[];
  correct_letters?: string | string[];
  answer?: string;
  rationale?: string;
  rationale_html?: string;
};

// Cache the parsed dataset for the lifetime of the server process instead of
// re-reading and re-parsing an ~11MB file on every request. The data file is
// static (checked into git, never changes at runtime), so there's no
// invalidation concern. Caching the promise itself (not just the resolved
// value) means concurrent requests during the very first load also share one
// read instead of racing to read the file multiple times.
let cachedRows: Promise<EnglishRow[]> | null = null;

export async function loadEnglishRaw(): Promise<EnglishRow[]> {
  if (!cachedRows) {
    cachedRows = (async () => {
      const file = path.join(process.cwd(), "data", "english_qa_normalized.json");
      const raw = await fs.readFile(file, "utf8");
      return JSON.parse(raw) as EnglishRow[];
    })().catch((err) => {
      cachedRows = null; // don't cache a failed read - let the next call retry
      throw err;
    });
  }
  return cachedRows;
}
