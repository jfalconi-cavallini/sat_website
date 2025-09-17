import fs from "node:fs/promises";
import path from "node:path";

export type Topic = { name: string; count: number };
export type Section = { name: string; items: Topic[] };

/** Minimal fields we need from your JSON */
type EnglishRow = {
  domain_desc: string;   // e.g. "Information and Ideas"
  skill_desc: string;    // e.g. "Inferences"
};

export async function loadEnglishSections(): Promise<Section[]> {
  // Adjust filename if yours differs
  const file = path.join(process.cwd(), "data", "english_qa_normalized.json");
  const raw = await fs.readFile(file, "utf8");
  const rows: EnglishRow[] = JSON.parse(raw);

  // domain -> (skill -> count)
  const byDomain = new Map<string, Map<string, number>>();

  for (const r of rows) {
    const domain = r.domain_desc?.trim() || "Other";
    const skill  = r.skill_desc?.trim()  || "Uncategorized";
    if (!byDomain.has(domain)) byDomain.set(domain, new Map());
    const m = byDomain.get(domain)!;
    m.set(skill, (m.get(skill) || 0) + 1);
  }

  // Transform to { name, items: [{name, count}] } sorted by count desc
  const sections: Section[] = Array.from(byDomain.entries()).map(([domain, skills]) => {
    const items = Array.from(skills.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    return { name: domain, items };
  });

  // Optional: sort sections by their total count desc
  sections.sort((a, b) =>
    b.items.reduce((s, t) => s + t.count, 0) - a.items.reduce((s, t) => s + t.count, 0)
  );

  return sections;
}

export type EnglishRow = {
  id: string;
  domain_desc: string;
  skill_desc: string;
  stimulus?: string;
  stem?: string;
  stimulus_html?: string;
  stem_html?: string;
  choices?: { key: string; text: string; correct?: boolean }[];
  rationale?: string;
  rationale_html?: string;
};

export async function loadEnglishRaw(): Promise<EnglishRow[]> {
  const file = path.join(process.cwd(), "data", "english_qa_normalized.json");
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as EnglishRow[];
}
