import type { EnglishRow } from "@/lib/english";
import type { MathRow } from "@/lib/math";

export const SYSTEM_PROMPT = `You are the AIPrep AI Tutor, an expert, encouraging SAT tutor embedded in a free SAT prep site.

Rules:
- Stay strictly on SAT topics: math, reading & writing, and test-taking strategy. If asked about anything else, briefly redirect back to SAT prep.
- Default to Socratic teaching: give a hint or ask a guiding question before revealing a final answer. Do not state the final multiple-choice letter or numeric answer on your very first reply to a question - help the student get there, unless they explicitly ask you to just give the answer after already trying.
- When a specific question is provided as context below, ground your explanation in it exactly - its stem, choices, and (if present) official rationale are ground truth. Don't contradict them or invent facts about the question.
- Offer more than one way to think about a problem when it helps (e.g., an algebraic approach and a plug-in-the-answers approach).
- Keep responses concise and conversational - this is a chat bubble, not an essay. A few short paragraphs at most, or a short list of steps.
- Write math using LaTeX delimiters: $...$ for inline math, $$...$$ for a block/display equation. Never use plain-text math notation like "x^2" or "sqrt(x)" - always LaTeX.`;

/**
 * Builds a compact, trusted description of a question for prompt grounding.
 * Only ever called with a question looked up server-side by ID from our own
 * cached dataset - never with client-supplied question content - so this is
 * safe to embed directly in the prompt with no injection risk from the
 * request body.
 */
export function formatQuestionContext(q: EnglishRow | MathRow): string {
  const lines: string[] = [];
  lines.push(`The student is currently looking at this question (domain: ${q.domain_desc}, skill: ${q.skill_desc}, difficulty: ${q.difficulty ?? "unknown"}):`);

  const stimulus = stripHtml(q.stimulus_html || q.stimulus);
  if (stimulus) lines.push(`Passage/context: ${stimulus}`);

  const stem = stripHtml(q.stem_html || q.stem);
  if (stem) lines.push(`Question: ${stem}`);

  if (q.choices?.length) {
    const choiceLines = q.choices.map((c, i) => {
      const key = c.key || String.fromCharCode(65 + i);
      const text = stripHtml(c.text_html || c.text || "");
      return `${key}. ${text}`;
    });
    lines.push(`Choices:\n${choiceLines.join("\n")}`);
  }

  const correct = Array.isArray(q.correct_letters) ? q.correct_letters[0] : q.correct_letters ?? q.answer;
  if (correct) lines.push(`Correct answer: ${correct}`);

  const rationale = stripHtml(q.rationale_html || q.rationale);
  if (rationale) lines.push(`Official rationale (use this as ground truth for your explanation): ${rationale}`);

  return lines.join("\n");
}

function stripHtml(html?: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
