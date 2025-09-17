import fs from "node:fs/promises";
import path from "node:path";

export type Topic = { name: string; count: number };
export type Section = { name: string; items: Topic[] };


export async function loadMathSections(): Promise<Section[]> {
  const file = path.join(process.cwd(), "data", "math_qa_normalized.json");
  const raw = await fs.readFile(file, "utf8");
  const rows: MathRow[] = JSON.parse(raw);

  const byDomain = new Map<string, Map<string, number>>();

  for (const r of rows) {
    const domain = r.domain_desc?.trim() || "Other";
    const skill = r.skill_desc?.trim() || "Uncategorized";
    if (!byDomain.has(domain)) byDomain.set(domain, new Map());
    const m = byDomain.get(domain)!;
    m.set(skill, (m.get(skill) || 0) + 1);
  }

  const sections: Section[] = Array.from(byDomain.entries()).map(([domain, skills]) => {
    const items = Array.from(skills.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    return { name: domain, items };
  });

  sections.sort(
    (a, b) =>
      b.items.reduce((s, t) => s + t.count, 0) -
      a.items.reduce((s, t) => s + t.count, 0)
  );

  return sections;
}

export type MathRow = {
  id: string;
  domain_desc: string;
  skill_desc: string;
  stem?: string;
  stem_html?: string;
  stimulus?: string;
  stimulus_html?: string;
  rationale?: string;
  rationale_html?: string;
  choices?: { key: string; text?: string; correct?: boolean }[];
};

export async function loadMathRaw(): Promise<MathRow[]> {
  const file = path.join(process.cwd(), "data", "math_qa_normalized.json");
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as MathRow[];
}
