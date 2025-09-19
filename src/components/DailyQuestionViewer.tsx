"use client";

import * as React from "react";

/* =======================================
   Domain types (adapted for Daily SAT)
======================================= */

type DifficultyCode = "E" | "M" | "H" | (string & {});
type QuestionType = "mcq" | "spr" | (string & {});

export interface Choice {
  key?: string;
  // Possible HTML-ish fields coming from various sources
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
}

export interface MediaItem {
  tag?: string;
  svg?: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  domain_desc?: string;
  skill_desc?: string;
  __source?: string; // "English" or "Math"

  // Text/HTML bodies
  stimulus_html?: string;
  stem_html?: string;
  stimulus?: string;
  stem?: string;

  // Media
  media?: { stimulus?: MediaItem[] };

  // MCQ / SPR payloads
  choices?: Choice[];
  correct_letters?: string | string[];
  answer?: string;

  difficulty?: DifficultyCode;

  // Explanations (only shown after quiz submission)
  rationale_html?: string;
  rationale?: string;
}

/* ---------------------------------------
   Helpers for rendering math/choices
----------------------------------------*/

/** Pick any HTML/Math-ish field if present */
function pickHtmlLike(c: Choice | string): string | undefined {
  if (typeof c === "string") return c;
  return (
    (typeof c?.html === "string" && c.html) ||
    (typeof c?.choice_html === "string" && c.choice_html) ||
    (typeof c?.math === "string" && c.math) ||
    (typeof c?.mathml === "string" && c.mathml) ||
    (typeof c?.latex === "string" && c.latex) ||
    undefined
  );
}

/** Convert verbose/worded math AND normalize negatives */
function formatWordedMath(raw?: string): string {
  if (!raw) return "";
  let t = raw.trim();

  // normalize dashes to hyphen, then fix "- 24" -> "-24"
  t = t.replace(/[–—]/g, "-").replace(/^\s*-\s+(?=\d|[a-zA-Z])/i, "-");

  // "negative ___" / "positive ___" (numbers, fractions, variables)
  t = t.replace(
    /\bnegative\s+(-?\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)(?=\b|$)/gi,
    "−$1"
  );
  t = t.replace(
    /\bpositive\s+(-?\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)(?=\b|$)/gi,
    "$1"
  );
  t = t.replace(/\bnegative\s+([a-zA-Z](?:\s*\^\s*\d+)?)(?=\b|$)/gi, "−$1");
  t = t.replace(/\bpositive\s+([a-zA-Z](?:\s*\^\s*\d+)?)(?=\b|$)/gi, "$1");

  // Basic verbal -> symbol
  t = t
    .replace(/StartFraction/gi, "(")
    .replace(/EndFraction/gi, ")")
    .replace(/Over/gi, ")/(")
    .replace(/left parenthesis/gi, "(")
    .replace(/right parenthesis/gi, ")")
    .replace(/\bequals\b/gi, "=")
    .replace(/\bminus\b/gi, "−")
    .replace(/\bplus\b/gi, "+")
    .replace(/\btimes\b/gi, "×")
    .replace(/\bmultiplied by\b/gi, "×")
    .replace(/\bdivided by\b/gi, "÷");

  // "2 x" -> "2x"
  t = t.replace(/(\d+)\s*([a-zA-Z])/g, "$1$2");

  // Powers
  t = t.replace(/\b([a-zA-Z])\s*squared\b/gi, "$1²");
  t = t.replace(/\b([a-zA-Z])\s*cubed\b/gi, "$1³");
  t = t.replace(/\bto the power of\s*2\b/gi, "²");
  t = t.replace(/\bto the power of\s*3\b/gi, "³");

  // Final spacing & true minus
  t = t.replace(/-/g, "−").replace(/\s*([=+\-×÷])\s*/g, " $1 ");
  return t.replace(/\s{2,}/g, " ").trim();
}

/** Render a choice that may be HTML/Math or plain worded text */
function renderChoiceContent(c: Choice | string) {
  const htmlish = pickHtmlLike(c);
  const obj = typeof c === "string" ? undefined : c;
  const text = obj?.text ?? obj?.label ?? obj?.value ?? obj?.alttext ?? (typeof c === "string" ? c : "");

  if (htmlish) {
    return (
      <div
        className="question-html"
        dangerouslySetInnerHTML={{ __html: htmlish }}
      />
    );
  }
  return <span>{formatWordedMath(String(text ?? ""))}</span>;
}

/* ---------------------------------------
   Shared small utilities
----------------------------------------*/

/** Safely render HTML fragments (stimulus/stem/rationale) */
function htmlBlock(html?: string, cls = "question-html") {
  if (!html) return null;
  return (
    <div
      suppressHydrationWarning
      className={`${cls} space-y-2 leading-6`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** If stimulus_html is empty but an SVG is present in media, render it */
function svgFromMedia(q: Question): string | undefined {
  const list = q?.media?.stimulus;
  if (!Array.isArray(list)) return;
  const hit = list.find((m) => m?.tag === "svg" && typeof m.svg === "string");
  return hit?.svg;
}

/** simple normalization for answer comparison */
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/* ---------------------------------------
   Daily Question Card (WHITE "paper")
----------------------------------------*/

function DailyQuestionCard({
  q,
  onAnswerSelect,
  selectedAnswer,
  onFlag,
  isFlagged,
  isSubmitted,
  userAnswer,
  isCorrect,
}: {
  q: Question;
  onAnswerSelect: (answer: string) => void;
  selectedAnswer: string | null;
  onFlag: () => void;
  isFlagged: boolean;
  isSubmitted: boolean;
  userAnswer?: string;
  isCorrect?: boolean;
}) {
  const {
    type,
    domain_desc,
    skill_desc,
    stimulus_html,
    stem_html,
    stimulus,
    stem,
    choices,
    correct_letters,
    answer,
    difficulty,
    rationale_html,
    rationale,
    __source,
  } = q;

  const isSPR = String(type || "").toLowerCase() === "spr";
  const fallbackSvg = !stimulus_html ? svgFromMedia(q) : undefined;

  const mcqCorrect = Array.isArray(correct_letters)
    ? correct_letters[0]
    : correct_letters;
  const correctAnswer = isSPR ? String(answer ?? "") : String(mcqCorrect ?? "");

  // Difficulty pill styling
  const getDifficultyDisplay = (diff?: DifficultyCode) => {
    if (diff === "E")
      return {
        text: "Easy",
        color: "text-green-700 bg-green-100 border-green-200",
      };
    if (diff === "M")
      return {
        text: "Medium",
        color: "text-yellow-700 bg-yellow-100 border-yellow-200",
      };
    if (diff === "H")
      return {
        text: "Hard",
        color: "text-red-700 bg-red-100 border-red-200",
      };
    return {
        text: "Unknown",
        color: "text-zinc-600 bg-zinc-100 border-zinc-200",
      };
  };
  const difficultyInfo = getDifficultyDisplay(difficulty);

  // Handle keyboard navigation for MCQ
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (isSubmitted || isSPR) return;
    
    if (e.key >= '1' && e.key <= '4' && choices) {
      const choiceIndex = parseInt(e.key) - 1;
      if (choices[choiceIndex]) {
        const choiceKey = choices[choiceIndex].key ?? String.fromCharCode(65 + choiceIndex);
        onAnswerSelect(choiceKey);
      }
    }
  };

  return (
    <div 
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl text-zinc-900"
      onKeyDown={handleKeyPress}
      tabIndex={0}
    >
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
          {__source && <span className="font-medium text-zinc-700">{__source}</span>}
          {domain_desc && <span>• {domain_desc}</span>}
          {skill_desc && <span>• {skill_desc}</span>}
          {difficulty && (
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium border ${difficultyInfo.color}`}
            >
              {difficultyInfo.text}
            </span>
          )}
          {type && (
            <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 text-[10px] border border-zinc-200">
              {isSPR ? "Free Response" : "Multiple Choice"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Show result only after submission */}
          {isSubmitted && userAnswer && (
            <div
              className={`px-3 py-1 rounded-full text-xs font-medium border ${
                isCorrect
                  ? "text-green-700 bg-green-100 border-green-200"
                  : "text-red-700 bg-red-100 border-red-200"
              }`}
            >
              {isCorrect ? "✓ Correct" : "✗ Incorrect"}
            </div>
          )}

          <button
            onClick={onFlag}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors border ${
              isFlagged
                ? "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200"
                : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50"
            }`}
            title={isFlagged ? "Remove flag" : "Flag for review"}
          >
            {isFlagged ? "🚩 Flagged" : "🏳️ Flag"}
          </button>
        </div>
      </div>

      {/* Question content */}
      <div className="mb-6 space-y-4">
        {htmlBlock(stimulus_html)}
        {!stimulus_html && fallbackSvg && htmlBlock(fallbackSvg, "question-figure")}
        {!stimulus_html && stimulus && <p>{stimulus}</p>}

        {htmlBlock(stem_html, "question-stem font-medium text-lg")}
        {!stem_html && stem && <p className="font-medium text-lg">{stem}</p>}
      </div>

      {/* ======= ANSWER UI ======= */}
      {/* SPR: Free-Response input */}
      {isSPR && (
        <div className="space-y-4">
          <input
            type="text"
            inputMode="text"
            value={selectedAnswer ?? ""}
            onChange={(e) => !isSubmitted && onAnswerSelect(e.target.value)}
            disabled={isSubmitted}
            placeholder="Type your answer…"
            className={`w-full rounded-xl border px-4 py-3 outline-none transition ${
              isSubmitted
                ? "border-zinc-200 bg-zinc-50 text-zinc-500"
                : "border-zinc-300 bg-white text-zinc-900 focus:border-blue-400"
            }`}
          />

          {/* Show results only after submission */}
          {isSubmitted && (
            <div className="mt-2 p-4 bg-zinc-50 rounded-xl border border-slate-200">
              <div className="text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600">Correct Answer:</span>
                  <span className="font-bold text-green-700">
                    {correctAnswer}
                  </span>
                </div>
                {userAnswer && (
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-600">Your Answer:</span>
                    <span
                      className={`font-bold ${
                        norm(userAnswer) === norm(correctAnswer)
                          ? "text-green-700"
                          : "text-red-700"
                      }`}
                    >
                      {userAnswer}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MCQ: choices */}
      {!isSPR && Array.isArray(choices) && choices.length > 0 && (
        <div className="space-y-4">
          <ul className="space-y-3">
            {choices.map((c: Choice, i: number) => {
              const choiceKey = c.key ?? String.fromCharCode(65 + i);
              const isSelected = selectedAnswer === choiceKey;
              const isChoiceCorrect = isSubmitted && choiceKey === mcqCorrect;
              const isChoiceIncorrect = isSubmitted && isSelected && choiceKey !== mcqCorrect;

              return (
                <li key={choiceKey}>
                  <button
                    onClick={() => !isSubmitted && onAnswerSelect(choiceKey)}
                    disabled={isSubmitted}
                    className={`w-full text-left rounded-xl border p-4 transition-all duration-200 ${
                      isChoiceCorrect
                        ? "border-green-500/50 bg-green-100 text-green-800"
                        : isChoiceIncorrect
                        ? "border-red-500/50 bg-red-100 text-red-800"
                        : isSelected
                        ? "border-blue-500/50 bg-blue-50 text-blue-800"
                        : isSubmitted
                        ? "border-zinc-200 bg-zinc-50 text-zinc-500"
                        : "border-zinc-300 bg-white text-zinc-800 hover:border-blue-300 hover:bg-blue-50"
                    } ${isSubmitted ? "cursor-not-allowed" : "cursor-pointer hover:scale-[1.02]"}`}
                  >
                    <span
                      className={`mr-3 font-bold text-base ${
                        isChoiceCorrect
                          ? "text-green-800"
                          : isChoiceIncorrect
                          ? "text-red-800"
                          : isSelected
                          ? "text-blue-800"
                          : isSubmitted
                          ? "text-zinc-500"
                          : "text-zinc-700"
                      }`}
                    >
                      {choiceKey}.
                      {isChoiceCorrect && " ✓"}
                      {isChoiceIncorrect && " ✗"}
                    </span>
                    <div className={isSubmitted && !isChoiceCorrect && !isChoiceIncorrect ? "text-zinc-500" : ""}>
                      {renderChoiceContent(c)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Show results only after submission */}
          {isSubmitted && (
            <div className="mt-2 p-4 bg-zinc-50 rounded-xl border border-slate-200">
              <div className="text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600">Correct Answer:</span>
                  <span className="font-bold text-green-700">{mcqCorrect}</span>
                </div>
                {userAnswer && (
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-600">Your Answer:</span>
                    <span
                      className={`font-bold ${
                        userAnswer === mcqCorrect
                          ? "text-green-700"
                          : "text-red-700"
                      }`}
                    >
                      {userAnswer}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Explanation - ONLY shown after submission */}
      {isSubmitted && (rationale_html || rationale) && (
        <div className="mt-6">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <h4 className="font-medium text-zinc-800 mb-2">Explanation:</h4>
            {rationale_html
              ? htmlBlock(rationale_html)
              : <p className="text-zinc-700">{rationale}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------
   Daily Question Viewer
----------------------------------------*/

export default function DailyQuestionViewer({
  rows,
  currentIndex,
  answers,
  flags,
  onAnswerSelect,
  onFlag,
  onNavigate,
  onSubmit,
  isSubmitted,
}: {
  rows: Question[];
  currentIndex: number;
  answers: Record<string, string>;
  flags: Record<string, boolean>;
  onAnswerSelect: (questionId: string, answer: string) => void;
  onFlag: (questionId: string) => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  onSubmit: () => void;
  isSubmitted: boolean;
  result?: { score: number; percent: number; elapsedSeconds: number };
}) {
  const question = rows[currentIndex];
  if (!question) return null;

  const questionId = question.id;
  const selectedAnswer = answers[questionId] || '';
  const isFlagged = flags[questionId] || false;

  // Get correct answer for comparison
  const getCorrectAnswer = (q: Question) => {
    const isSPR = String(q.type || "").toLowerCase() === "spr";
    if (isSPR) {
      return String(q.answer ?? "");
    } else {
      return Array.isArray(q.correct_letters) 
        ? q.correct_letters[0] 
        : String(q.correct_letters ?? "");
    }
  };

  const correctAnswer = getCorrectAnswer(question);
  const userAnswer = isSubmitted ? selectedAnswer : undefined;
  const isCorrect = isSubmitted && userAnswer ? norm(userAnswer) === norm(correctAnswer) : false;

  return (
    <div className="space-y-6">
      {/* Question Card */}
      <DailyQuestionCard
        q={question}
        onAnswerSelect={(answer) => onAnswerSelect(questionId, answer)}
        selectedAnswer={selectedAnswer || null}
        onFlag={() => onFlag(questionId)}
        isFlagged={isFlagged}
        isSubmitted={isSubmitted}
        userAnswer={userAnswer}
        isCorrect={isCorrect}
      />

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onNavigate('prev')}
          disabled={currentIndex === 0}
          className="px-6 py-3 bg-slate-700/50 hover:bg-slate-600/50 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl border border-slate-600/50 transition-all hover:scale-105"
        >
          ← Previous
        </button>
        
        <div className="flex items-center gap-4">
          <div className="text-slate-400 text-sm">
            Question {currentIndex + 1} of {rows.length}
          </div>
          
          {/* Submit Quiz button - always available during quiz */}
          {!isSubmitted && (
            <button
              onClick={onSubmit}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl border border-emerald-500 transition-all hover:scale-105 font-medium"
            >
              Submit Quiz
            </button>
          )}
        </div>
        
        {currentIndex < rows.length - 1 ? (
          <button
            onClick={() => onNavigate('next')}
            className="px-6 py-3 bg-slate-700/50 hover:bg-slate-600/50 text-white rounded-xl border border-slate-600/50 transition-all hover:scale-105"
          >
            Next →
          </button>
        ) : (
          <div className="w-[100px]"></div> /* Spacer to maintain layout */
        )}
      </div>

      {/* Question Navigator - shown during quiz only */}
      {!isSubmitted && (
        <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
          <div className="mb-4 text-sm text-slate-300 text-center">
            Question Navigator • Use 1-4 keys for quick selection
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            {rows.map((_, index) => {
              const isActive = index === currentIndex;
              const hasAnswer = answers[rows[index].id];
              const isFlagged = flags[rows[index].id];
              
              return (
                <button
                  key={index}
                  onClick={() => {
                    const diff = index - currentIndex;
                    const direction = diff > 0 ? 'next' : 'prev';
                    for (let i = 0; i < Math.abs(diff); i++) {
                      onNavigate(direction);
                    }
                  }}
                  className={`
                    w-12 h-12 rounded-xl border transition-all text-sm font-medium
                    ${isActive 
                      ? 'bg-indigo-600 border-indigo-500 text-white scale-110' 
                      : hasAnswer
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                      : isFlagged
                      ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                      : 'bg-slate-700/50 border-slate-600/50 text-slate-300 hover:bg-slate-600/50'
                    }
                  `}
                >
                  {index + 1}
                  {isFlagged && !isActive && <div className="text-xs">🚩</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}