import { describe, it, expect } from "vitest";
import {
  norm,
  isCorrectAnswer,
  pickHtmlLike,
  normalizeMathML,
  formatWordedMath,
} from "./question-render";

describe("norm", () => {
  it("trims and lowercases", () => {
    expect(norm("  Hello World  ")).toBe("hello world");
  });
  it("handles null/undefined safely", () => {
    expect(norm(null)).toBe("");
    expect(norm(undefined)).toBe("");
  });
});

describe("isCorrectAnswer", () => {
  // Regression tests for C6: the Daily Challenge used to compare raw strings
  // while the question bank normalized first, so the same typed answer could
  // be graded correct in one place and incorrect in the other.
  it("grades MCQ letters, case-insensitively", () => {
    expect(isCorrectAnswer("A", "A")).toBe(true);
    expect(isCorrectAnswer("a", "A")).toBe(true);
    expect(isCorrectAnswer("B", "A")).toBe(false);
  });

  it("grades SPR free-response answers, ignoring surrounding whitespace and case", () => {
    expect(isCorrectAnswer("  38 ", "38")).toBe(true);
    expect(isCorrectAnswer("Y=5", "y=5")).toBe(true);
    expect(isCorrectAnswer("37", "38")).toBe(false);
  });

  it("treats missing/undefined answers as unequal to a real answer", () => {
    expect(isCorrectAnswer(undefined, "38")).toBe(false);
    expect(isCorrectAnswer("", "38")).toBe(false);
  });
});

describe("pickHtmlLike", () => {
  it("prefers text_html - the field the real dataset actually uses", () => {
    // Regression test for the C4 bug: choices were falling back to raw
    // worded text because text_html was never checked.
    const choice = { text_html: "<math><mn>3</mn></math>", text: "3" };
    expect(pickHtmlLike(choice)).toBe("<math><mn>3</mn></math>");
  });
  it("falls back through the other html-ish fields in order", () => {
    expect(pickHtmlLike({ html: "<b>a</b>" })).toBe("<b>a</b>");
    expect(pickHtmlLike({ choice_html: "<i>b</i>" })).toBe("<i>b</i>");
  });
  it("returns undefined when nothing html-ish is present", () => {
    expect(pickHtmlLike({ text: "plain text" })).toBeUndefined();
  });
  it("passes strings through directly", () => {
    expect(pickHtmlLike("raw string")).toBe("raw string");
  });
});

describe("normalizeMathML", () => {
  it("leaves content without mfenced untouched (fast path)", () => {
    const html = "<math><mi>x</mi><mo>+</mo><mn>1</mn></math>";
    expect(normalizeMathML(html)).toBe(html);
  });

  it("rewrites default-delimiter mfenced into mrow+mo", () => {
    const input = "<math><mfenced><mrow><mi>x</mi><mo>-</mo><mn>8</mn></mrow></mfenced></math>";
    const out = normalizeMathML(input);
    expect(out).not.toContain("<mfenced");
    expect(out).toContain("<mo>(</mo>");
    expect(out).toContain("<mo>)</mo>");
    expect(out).toContain("<mi>x</mi><mo>-</mo><mn>8</mn>");
  });

  it("respects custom open/close attributes (absolute value bars)", () => {
    const input = '<math><mfenced open="|" close="|"><mi>x</mi></mfenced></math>';
    const out = normalizeMathML(input);
    expect(out).not.toContain("<mfenced");
    expect((out.match(/<mo>\|<\/mo>/g) || []).length).toBe(2);
  });

  it("resolves nested mfenced innermost-first", () => {
    const input =
      '<math><mfenced><mrow><mi>x</mi><mo>-</mo><mfenced open="|" close="|"><mi>y</mi></mfenced></mrow></mfenced></math>';
    const out = normalizeMathML(input);
    expect(out).not.toContain("<mfenced");
    expect(out).toContain("<mo>(</mo>");
    expect(out).toContain("<mo>|</mo>");
  });

  it("inserts the default comma separator for multi-child fences (e.g. ordered pairs)", () => {
    const input = "<math><mfenced><mi>x</mi><mi>y</mi></mfenced></math>";
    const out = normalizeMathML(input);
    expect(out).toContain("<mi>x</mi><mo>,</mo><mi>y</mi>");
  });

  it("fails open on malformed input instead of throwing or corrupting content", () => {
    const input = "<math><mfenced><mi>x</mi></math>"; // missing </mfenced>
    expect(normalizeMathML(input)).toBe(input);
  });

  it("handles a real stem_html sample from the dataset", () => {
    // Pulled from data/math_qa_normalized.json - StartFraction ... equation
    // ending in r(x - 8), where the mfenced wraps "x - 8".
    const real =
      '<math alttext="..."><mfrac><mrow><mrow><mn>12</mn></mrow><mi>x</mi><mo>+</mo><mrow><mn>28</mn></mrow></mrow><mrow><mn>4</mn></mrow></mfrac><mo>-</mo><mfrac><mi>s</mi><mrow><mn>13</mn></mrow></mfrac><mo>=</mo><mi>r</mi><mfenced><mrow><mi>x</mi><mo>-</mo><mrow><mn>8</mn></mrow></mrow></mfenced></math>';
    const out = normalizeMathML(real);
    expect(out).not.toContain("<mfenced");
    expect(out).toContain("<mi>r</mi><mrow><mo>(</mo>");
  });
});

describe("formatWordedMath", () => {
  it("returns an empty string for empty input", () => {
    expect(formatWordedMath()).toBe("");
    expect(formatWordedMath("")).toBe("");
  });

  it("converts basic verbal operators to symbols", () => {
    expect(formatWordedMath("x plus 2 equals 5")).toBe("x + 2 = 5");
  });

  it("converts negative phrasing to a true minus sign (U+2212, not a hyphen)", () => {
    expect(formatWordedMath("negative 24")).toBe("− 24");
    expect(formatWordedMath("negative 24")).not.toContain("-24"); // ASCII hyphen
  });

  it("renders squared/cubed as <sup> tags (HTML, not plain text)", () => {
    expect(formatWordedMath("x squared")).toBe("x<sup>2</sup>");
    expect(formatWordedMath("x cubed")).toBe("x<sup>3</sup>");
  });

  it("renders general caret exponents as <sup> tags too", () => {
    expect(formatWordedMath("x^4")).toContain("<sup>4</sup>");
  });
});
