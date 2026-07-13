/**
 * Shared question-content rendering helpers.
 *
 * Previously this logic (pickHtmlLike / formatWordedMath / htmlBlock) was
 * copy-pasted across QuestionViewer.tsx, the (now-deleted) DailyQuestionViewer.tsx,
 * and daily/page.tsx, and had already drifted between copies. This is the one
 * place it lives now.
 *
 * Rendering strategy: the dataset stores real MathML (<math>, <mfrac>, <msup>,
 * etc.) in *_html fields. That's kept as native MathML — rendered directly by
 * the browser — rather than converted to LaTeX/KaTeX, since a bulk automated
 * conversion of ~2,800 questions' math risks silently introducing errors
 * (wrong sign, dropped exponent) in a product whose job is teaching correct
 * math. KaTeX is used elsewhere in the app (the AI tutor chat) for the model's
 * own freely-generated prose, where LaTeX is the natural output format — a
 * different content source, so a different renderer is the right call, not a
 * gap to close.
 */
import * as React from "react";

export type HtmlLikeChoice = {
  key?: string;
  // Possible HTML-ish fields coming from various sources
  text_html?: string; // the actual field name used by the normalized dataset
  html?: string;
  choice_html?: string;
  math?: string;
  mathml?: string;
  latex?: string;
  // Text fallbacks
  text?: string;
  label?: string;
  value?: string;
  alttext?: string;
};

/** Normalize an answer before comparing (trim + lowercase). */
export const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/**
 * Grade a submitted answer against the correct answer (MCQ letter or SPR
 * free-response text), normalizing both sides first. Previously this
 * comparison was inlined separately in QuestionViewer and the Daily
 * Challenge, and the daily challenge's copies weren't normalized at all -
 * the same typed answer could be graded correct in practice and incorrect
 * in the graded, leaderboard-feeding daily quiz. One function now, used
 * everywhere a submission is graded.
 */
export function isCorrectAnswer(submitted: unknown, correct: unknown): boolean {
  return norm(submitted) === norm(correct);
}

/** Pick any HTML/Math-ish field if present, preferring the dataset's real text_html field. */
export function pickHtmlLike(c: HtmlLikeChoice | string): string | undefined {
  if (typeof c === "string") return c;
  return (
    (typeof c?.text_html === "string" && c.text_html) ||
    (typeof c?.html === "string" && c.html) ||
    (typeof c?.choice_html === "string" && c.choice_html) ||
    (typeof c?.math === "string" && c.math) ||
    (typeof c?.mathml === "string" && c.mathml) ||
    (typeof c?.latex === "string" && c.latex) ||
    undefined
  );
}

/**
 * Convert verbose/worded math to an HTML fragment (may include <sup> tags for
 * exponents), and normalize negatives. This is a fallback only, for the rare
 * case where no *_html field is present — real question content should
 * always carry proper MathML, which normalizeMathML/htmlBlock render
 * directly instead of relying on this regex conversion. Returns HTML, so
 * callers must render it via dangerouslySetInnerHTML, not as plain text.
 */
export function formatWordedMath(raw?: string): string {
  if (!raw) return "";
  let t = raw.trim();

  // normalize dashes to hyphen, then fix "- 24" -> "-24"
  t = t.replace(/[–—]/g, "-").replace(/(^|[\s(])-\s+(?=\d|[a-zA-Z])/g, "$1-");

  // Verbal -> symbols
  t = t
    .replace(/\bequals\b/gi, "=")
    .replace(/\bminus\b/gi, "−")
    .replace(/\bplus\b/gi, "+")
    .replace(/\btimes\b/gi, "×")
    .replace(/\bmultiplied by\b/gi, "×")
    .replace(/\bdivided by\b/gi, "÷")
    .replace(/StartFraction/gi, "(")
    .replace(/EndFraction/gi, ")")
    .replace(/Over/gi, ")/(")
    .replace(/left parenthesis/gi, "(")
    .replace(/right parenthesis/gi, ")");

  // "negative ___" / "positive ___" (numbers, fractions, variables)
  t = t.replace(/\bnegative\s+(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)/gi, "−$1");
  t = t.replace(/\bpositive\s+(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)/gi, "$1");
  t = t.replace(/\bnegative\s+([a-zA-Z](?:\s*\^\s*\d+)?)/gi, "−$1");
  t = t.replace(/\bpositive\s+([a-zA-Z](?:\s*\^\s*\d+)?)/gi, "$1");

  // Remove weird spacing around parentheses & inside simple ( x ) -> (x)
  t = t.replace(/([A-Za-z])\s*\(\s*/g, "$1(").replace(/\s*\)\s*/g, ")");

  // Collapse "2 x" -> "2x"
  t = t.replace(/(\d+)\s*([a-zA-Z])/g, "$1$2");

  // Exponents: caret and "Superscript x"
  t = t.replace(/\^\s*([A-Za-z0-9()+\-]+)/g, (_, p1) => `<sup>${p1}</sup>`);
  t = t.replace(/\bSuperscript\s*([A-Za-z0-9()+\-]+)\b/gi, (_m, p1) => `<sup>${p1}</sup>`);

  // "x squared/cubed" and "to the power of n"
  t = t.replace(/\b([a-zA-Z])\s*squared\b/gi, "$1<sup>2</sup>");
  t = t.replace(/\b([a-zA-Z])\s*cubed\b/gi, "$1<sup>3</sup>");
  t = t.replace(/\bto the power of\s*2\b/gi, "<sup>2</sup>");
  t = t.replace(/\bto the power of\s*3\b/gi, "<sup>3</sup>");

  // Thin spacing around operators (including minus -> true minus)
  t = t.replace(/-/g, "−").replace(/\s*([=+−×÷])\s*/g, " $1 ");

  return t.replace(/\s{2,}/g, " ").trim();
}

/* ---------------------------------------------------------------------
   MathML normalization

   Chrome/Edge's native MathML renderer ("MathML Core", shipped since Chrome
   109) dropped support for <mfenced> — it was deprecated in the MathML3 spec
   in favor of explicit <mo> fence characters. The dataset uses <mfenced> for
   parenthesized expressions and absolute-value bars, so on Chrome those can
   render without their delimiters. This rewrites <mfenced> into the modern
   <mrow>+<mo> equivalent.

   Implemented as a pure string transform (no DOM APIs) so it produces
   identical output during SSR and after client hydration — no flash of
   broken markup on first paint.
--------------------------------------------------------------------- */

function findMatchingClose(html: string, from: number, tagName: string): number {
  const openRe = new RegExp(`<${tagName}\\b[^>]*>`, "g");
  const closeRe = new RegExp(`</${tagName}>`, "g");
  let depth = 1;
  let pos = from;
  while (depth > 0) {
    openRe.lastIndex = pos;
    closeRe.lastIndex = pos;
    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);
    if (!nextClose) return -1;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      pos = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      if (depth === 0) return nextClose.index;
      pos = nextClose.index + nextClose[0].length;
    }
  }
  return -1;
}

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;

/** Split an HTML fragment into its top-level (depth-0) child elements. */
function splitTopLevelElements(inner: string): string[] {
  const children: string[] = [];
  let depth = 0;
  let start = 0;
  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(inner))) {
    const isClosing = match[0].startsWith("</");
    const isSelfClosing = match[2] === "/";
    if (isSelfClosing) {
      if (depth === 0) children.push(match[0]);
      continue;
    }
    if (!isClosing) {
      if (depth === 0) start = match.index;
      depth++;
    } else {
      depth--;
      if (depth === 0) {
        children.push(inner.slice(start, match.index + match[0].length));
      }
    }
  }
  if (children.length === 0) {
    const trimmed = inner.trim();
    return trimmed ? [trimmed] : [];
  }
  return children;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function rewriteMfenced(html: string): string {
  const openMatch = /<mfenced([^>]*)>/.exec(html);
  if (!openMatch) return html;

  const openTagEnd = openMatch.index + openMatch[0].length;
  const closeIndex = findMatchingClose(html, openTagEnd, "mfenced");
  if (closeIndex === -1) return html; // malformed — leave untouched

  const before = html.slice(0, openMatch.index);
  const inner = html.slice(openTagEnd, closeIndex);
  const closeTagEnd = html.indexOf(">", closeIndex) + 1;
  const after = html.slice(closeTagEnd);

  const resolvedInner = rewriteMfenced(inner); // resolve nested mfenced first

  const attrs = openMatch[1] || "";
  const open = /open="([^"]*)"/.exec(attrs)?.[1] ?? "(";
  const close = /close="([^"]*)"/.exec(attrs)?.[1] ?? ")";
  const separators = (/separators="([^"]*)"/.exec(attrs)?.[1] ?? ",").replace(/\s+/g, "");

  const children = splitTopLevelElements(resolvedInner);
  const parts = [`<mo>${escapeXml(open)}</mo>`];
  children.forEach((child, i) => {
    if (i > 0) {
      const sep = separators[Math.min(i - 1, Math.max(separators.length - 1, 0))] || ",";
      parts.push(`<mo>${escapeXml(sep)}</mo>`);
    }
    parts.push(child);
  });
  parts.push(`<mo>${escapeXml(close)}</mo>`);

  const replacement = `<mrow>${parts.join("")}</mrow>`;
  return before + replacement + rewriteMfenced(after); // continue scanning remainder for siblings
}

/** Rewrite deprecated MathML in an HTML fragment. Fails open on malformed input. */
export function normalizeMathML(html: string): string {
  if (!html || !html.includes("<mfenced")) return html;
  try {
    return rewriteMfenced(html);
  } catch {
    return html; // never block rendering over a sanitizer bug
  }
}

/* ---------------------------------------------------------------------
   Shared render helpers
--------------------------------------------------------------------- */

/** Render a stimulus/stem/rationale HTML fragment, normalizing MathML along the way. */
export function htmlBlock(html?: string, cls = "question-html") {
  if (!html) return null;
  return (
    <div
      suppressHydrationWarning
      className={`${cls} space-y-2 leading-6`}
      dangerouslySetInnerHTML={{ __html: normalizeMathML(html) }}
    />
  );
}

/** Render a choice that may be HTML/Math (preferring the dataset's real text_html field) or plain worded text. */
export function renderChoiceContent(c: HtmlLikeChoice | string) {
  const htmlish = pickHtmlLike(c);
  const obj = typeof c === "string" ? undefined : c;
  const text =
    obj?.text ?? obj?.label ?? obj?.value ?? obj?.alttext ?? (typeof c === "string" ? c : "");

  if (htmlish) {
    return (
      <div
        className="question-html"
        dangerouslySetInnerHTML={{ __html: normalizeMathML(htmlish) }}
      />
    );
  }
  return (
    <span dangerouslySetInnerHTML={{ __html: formatWordedMath(String(text ?? "")) }} />
  );
}
