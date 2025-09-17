"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  getQuestionProgress,
  saveQuestionProgress,
  toggleQuestionFlag,
  getAllProgress,
  type QuestionStatus,
} from "@/lib/progress";

/* ---------------------------------------
   Helpers for rendering math/choices
----------------------------------------*/

/** Pick any HTML/Math-ish field if present */
function pickHtmlLike(c: any): string | undefined {
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
function renderChoiceContent(c: any) {
  const htmlish = pickHtmlLike(c);
  const text = c?.text ?? c?.label ?? c?.value ?? c?.alttext ?? c;

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

type Row = any;

/** Safely render HTML fragments (stimulus/stem/rationale) — inherits parent color */
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
function svgFromMedia(q: any): string | undefined {
  const list = q?.media?.stimulus;
  if (!Array.isArray(list)) return;
  const hit = list.find(
    (m: any) => m?.tag === "svg" && typeof m.svg === "string"
  );
  return hit?.svg;
}

/** simple normalization for answer comparison */
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/* ---------------------------------------
   Question Card (WHITE "paper")
----------------------------------------*/

function QuestionCard({
  q,
  onAnswerSubmit,
  selectedAnswer,
  onAnswerSelect,
  questionProgress,
  onToggleFlag,
}: {
  q: Row;
  onAnswerSubmit: (answer: string) => void;
  selectedAnswer: string | null;
  onAnswerSelect: (answer: string) => void;
  questionProgress: any;
  onToggleFlag: () => void;
}) {
  const {
    type, // "mcq" | "spr"
    domain_desc,
    skill_desc,
    stimulus_html,
    stem_html,
    stimulus,
    stem,
    choices,
    correct_letters, // MCQ
    answer, // SPR
    difficulty,
    rationale_html,
    rationale,
  } = q ?? {};

  const isSPR = String(type || "").toLowerCase() === "spr";
  const fallbackSvg = !stimulus_html ? svgFromMedia(q) : undefined;

  const isAnswered =
    questionProgress?.status === "correct" ||
    questionProgress?.status === "incorrect";
  const isFlagged = questionProgress?.status === "flagged";

  const mcqCorrect = Array.isArray(correct_letters)
    ? correct_letters[0]
    : correct_letters;
  const correctAnswer = isSPR ? String(answer ?? "") : String(mcqCorrect ?? "");

  const [showExplanation, setShowExplanation] = React.useState(false);

  // Difficulty pill styling (colors are fine on white)
  const getDifficultyDisplay = (diff: string) => {
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

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl text-zinc-900">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
          {domain_desc && <span>{domain_desc}</span>}
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
          {questionProgress?.status &&
            questionProgress.status !== "unanswered" && (
              <div
                className={`px-3 py-1 rounded-full text-xs font-medium border ${
                  questionProgress.status === "correct"
                    ? "text-green-700 bg-green-100 border-green-200"
                    : questionProgress.status === "incorrect"
                    ? "text-red-700 bg-red-100 border-red-200"
                    : questionProgress.status === "flagged"
                    ? "text-amber-700 bg-amber-100 border-amber-200"
                    : "text-zinc-600 bg-zinc-100 border-zinc-200"
                }`}
              >
                {questionProgress.status === "correct"
                  ? "✓ Correct"
                  : questionProgress.status === "incorrect"
                  ? "✗ Incorrect"
                  : questionProgress.status === "flagged"
                  ? "🚩 Flagged"
                  : "Answered"}
              </div>
            )}

          <button
            onClick={onToggleFlag}
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
          <div className="flex items-center gap-3">
            <input
              type="text"
              inputMode="text"
              value={selectedAnswer ?? ""}
              onChange={(e) => !isAnswered && onAnswerSelect(e.target.value)}
              onKeyDown={(e) => {
                if (
                  !isAnswered &&
                  e.key === "Enter" &&
                  (selectedAnswer ?? "").trim()
                ) {
                  onAnswerSubmit((selectedAnswer ?? "").trim());
                }
              }}
              disabled={isAnswered}
              placeholder="Type your answer…"
              className={`w-full rounded-xl border px-4 py-3 outline-none transition ${
                isAnswered
                  ? "border-zinc-200 bg-zinc-50 text-zinc-500"
                  : "border-zinc-300 bg-white text-zinc-900 focus:border-blue-400"
              }`}
            />
            {!isAnswered && (
              <button
                onClick={() =>
                  onAnswerSubmit((selectedAnswer ?? "").trim())
                }
                disabled={!((selectedAnswer ?? "").trim())}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl disabled:opacity-50 hover:bg-blue-500 transition-all font-semibold"
              >
                Submit
              </button>
            )}
          </div>

          {isAnswered && (
            <div className="mt-2 p-4 bg-zinc-50 rounded-xl border border-slate-200">
              <div className="text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600">Correct Answer:</span>
                  <span className="font-bold text-green-700">
                    {correctAnswer}
                  </span>
                </div>
                {questionProgress?.selectedAnswer && (
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-600">Your Answer:</span>
                    <span
                      className={`font-bold ${
                        norm(questionProgress.selectedAnswer) ===
                        norm(correctAnswer)
                          ? "text-green-700"
                          : "text-red-700"
                      }`}
                    >
                      {questionProgress.selectedAnswer}
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
            {choices.map((c: any, i: number) => {
              const choiceKey = c.key ?? String.fromCharCode(65 + i);
              const isSelected = selectedAnswer === choiceKey;
              const isCorrect = isAnswered && choiceKey === mcqCorrect;
              const isIncorrect = isAnswered && isSelected && choiceKey !== mcqCorrect;

              return (
                <li key={choiceKey}>
                  <button
                    onClick={() => !isAnswered && onAnswerSelect(choiceKey)}
                    disabled={isAnswered}
                    className={`w-full text-left rounded-xl border p-4 transition-all duration-200 ${
                      isCorrect
                        ? "border-green-500/50 bg-green-100 text-green-800"
                        : isIncorrect
                        ? "border-red-500/50 bg-red-100 text-red-800"
                        : isSelected
                        ? "border-blue-500/50 bg-blue-50 text-blue-800"
                        : isAnswered
                        ? "border-zinc-200 bg-zinc-50 text-zinc-500"
                        : "border-zinc-300 bg-white text-zinc-800 hover:border-blue-300 hover:bg-blue-50"
                    } ${isAnswered ? "cursor-not-allowed" : "cursor-pointer hover:scale-[1.02]"}`}
                  >
                    <span
                      className={`mr-3 font-bold text-base ${
                        isCorrect
                          ? "text-green-800"
                          : isIncorrect
                          ? "text-red-800"
                          : isSelected
                          ? "text-blue-800"
                          : isAnswered
                          ? "text-zinc-500"
                          : "text-zinc-700"
                      }`}
                    >
                      {choiceKey}.
                      {isCorrect && " ✓"}
                      {isIncorrect && " ✗"}
                    </span>
                    <div className={isAnswered && !isCorrect && !isIncorrect ? "text-zinc-500" : ""}>
                      {renderChoiceContent(c)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {!isAnswered && selectedAnswer && (
            <div className="flex justify-center pt-4">
              <button
                onClick={() => onAnswerSubmit(selectedAnswer)}
                className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-all font-semibold"
              >
                Submit Answer
              </button>
            </div>
          )}

          {isAnswered && (
            <div className="mt-2 p-4 bg-zinc-50 rounded-xl border border-slate-200">
              <div className="text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600">Correct Answer:</span>
                  <span className="font-bold text-green-700">{mcqCorrect}</span>
                </div>
                {questionProgress?.selectedAnswer && (
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-600">Your Answer:</span>
                    <span
                      className={`font-bold ${
                        questionProgress.selectedAnswer === mcqCorrect
                          ? "text-green-700"
                          : "text-red-700"
                      }`}
                    >
                      {questionProgress.selectedAnswer}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Explanation toggle */}
      {(rationale_html || rationale) && (
        <div className="mt-6">
          <button
            onClick={() => setShowExplanation((s) => !s)}
            className="px-4 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 transition"
          >
            {showExplanation ? "Hide Explanation" : "Show Explanation"}
          </button>

          {showExplanation && (
            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              {rationale_html
                ? htmlBlock(rationale_html)
                : <p className="text-zinc-700">{rationale}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------
   Viewer (dark page chrome)
----------------------------------------*/

// Fisher–Yates shuffle
function shuffle<T>(arr: T[]) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Filter questions by status
function filterQuestionsByStatus(rows: Row[], status?: string): Row[] {
  if (!status || status === "All") return rows;
  const progress = getAllProgress();
  return rows.filter((row) => {
    const qp = progress[row.id];
    switch (status) {
      case "Unanswered":
        return !qp || qp.status === "unanswered";
      case "Correct":
        return qp?.status === "correct";
      case "Incorrect":
        return qp?.status === "incorrect";
      case "Flagged":
        return qp?.status === "flagged";
      default:
        return true;
    }
  });
}

export default function QuestionViewer({
  rows,
  subject,
  domain,
  skill,
  difficulty,
  status,
}: {
  rows: Row[];
  subject: "english" | "math";
  domain?: string;
  skill?: string;
  difficulty?: string;
  status?: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const filteredRows = React.useMemo(
    () => filterQuestionsByStatus(rows, status),
    [rows, status]
  );

  const total = filteredRows.length;
  const iParam = Number(searchParams.get("i") || "1");
  const initialIndex = Math.min(
    Math.max(isFinite(iParam) ? iParam : 1, 1),
    Math.max(total, 1)
  );

  // local UI state
  const [showNav, setShowNav] = React.useState(true);
  const [order, setOrder] = React.useState<number[]>(
    () => Array.from({ length: total }, (_, i) => i)
  );
  const [selectedAnswers, setSelectedAnswers] = React.useState<{
    [key: string]: string;
  }>({});
  const [progressUpdates, setProgressUpdates] = React.useState(0);

  React.useEffect(() => {
    setOrder(Array.from({ length: total }, (_, i) => i));
  }, [total]);

  const idxInOrder = Math.min(
    Math.max(initialIndex - 1, 0),
    Math.max(total - 1, 0)
  );
  const activeRow = filteredRows[order[idxInOrder]];

  const setIndex = (next1Based: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("i", String(next1Based));
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const onFirst = () => setIndex(1);
  const onPrev = () => setIndex(idxInOrder <= 0 ? total : idxInOrder);
  const onNext = () => setIndex(idxInOrder + 2 > total ? 1 : idxInOrder + 2);
  const onLast = () => setIndex(total);

  const onShuffle = () => {
    const next = shuffle(order);
    const currentQuestionIndex = order[idxInOrder];
    const newPos = next.findIndex((i) => i === currentQuestionIndex);
    setOrder(next);
    setIndex(newPos + 1);
  };

  const handleAnswerSelect = (questionId: string, answer: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleAnswerSubmit = (
    questionId: string,
    selectedAnswer: string,
    correctAnswer: string
  ) => {
    const isCorrect = norm(selectedAnswer) === norm(correctAnswer);
    const st: QuestionStatus = isCorrect ? "correct" : "incorrect";
    saveQuestionProgress(questionId, st, selectedAnswer);

    setSelectedAnswers((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });

    setProgressUpdates((p) => p + 1);
    window.dispatchEvent(new Event("progressUpdated"));
  };

  const handleToggleFlag = (questionId: string) => {
    toggleQuestionFlag(questionId);
    setProgressUpdates((p) => p + 1);
    window.dispatchEvent(new Event("progressUpdated"));
  };

  const getQuestionProgressWithUpdates = (questionId: string) => {
    progressUpdates; // dep to force recompute
    return getQuestionProgress(questionId);
  };

  // autoscroll active tile into view
  const activeRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    activeRef.current?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "smooth",
    });
  }, [idxInOrder, order]);

  if (!filteredRows || filteredRows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-white/70 backdrop-blur-sm">
        <div className="text-center">
          <div className="text-6xl mb-4 opacity-50">📚</div>
          <h3 className="text-xl font-semibold text-white mb-2">
            No questions found
          </h3>
          <p>
            No questions match your current filters for {subject}
            {domain ? ` • ${domain}` : ""}
            {skill ? ` • ${skill}` : ""}
            {difficulty ? ` • ${difficulty}` : ""}
            {status ? ` • ${status}` : ""}.
          </p>
        </div>
      </div>
    );
  }

  const keyGo = (e: React.KeyboardEvent, n: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIndex(n);
    }
  };

  const activeType = String(activeRow?.type || "").toLowerCase();
  const activeCorrectAnswer =
    activeType === "spr"
      ? String(activeRow?.answer ?? "")
      : String(
          Array.isArray(activeRow?.correct_letters)
            ? activeRow.correct_letters[0]
            : activeRow?.correct_letters ?? ""
        );

  return (
    <div className="min-h-screen bg-[#0b1020] text-white">
      {/* Background effects */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(900px_400px_at_20%_-10%,rgba(99,102,241,0.25),transparent_60%),radial-gradient(700px_300px_at_80%_-10%,rgba(34,197,94,0.18),transparent_60%)]" />
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold capitalize">
            {subject}
            {domain && <span className="text-white/70"> • {domain}</span>}
            {skill && <span className="text-white/70"> • {skill}</span>}
            {difficulty && <span className="text-white/70"> • {difficulty}</span>}
            {status && <span className="text-white/70"> • {status}</span>}
          </h1>

          <div className="flex gap-2">
            <button onClick={onFirst} className="qn-btn">« First</button>
            <button onClick={onPrev} className="qn-btn">← Prev</button>
            <button onClick={onNext} className="qn-btn">Next →</button>
            <button onClick={onLast} className="qn-btn">Last »</button>
          </div>
        </div>

        {/* Active question (white card) */}
        <QuestionCard
          q={activeRow}
          onAnswerSubmit={(answer) =>
            handleAnswerSubmit(activeRow.id, answer, activeCorrectAnswer)
          }
          selectedAnswer={selectedAnswers[activeRow?.id] || null}
          onAnswerSelect={(answer) => handleAnswerSelect(activeRow.id, answer)}
          questionProgress={getQuestionProgressWithUpdates(activeRow?.id)}
          onToggleFlag={() => handleToggleFlag(activeRow.id)}
        />

        {/* Controls + navigator (kept dark/translucent) */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <button onClick={() => setShowNav((s) => !s)} className="qn-btn">
              {showNav ? "Hide Navigation" : "Show Navigation"}
            </button>

            <button onClick={onShuffle} className="qn-btn" title="Shuffle Question Order">
              Shuffle Questions
            </button>

            <div className="ml-auto text-sm text-white/60">
              Question{" "}
              <span className="font-semibold text-white">{idxInOrder + 1}</span>{" "}
              of <span className="font-semibold text-white">{total}</span>
            </div>
          </div>

          {showNav && (
            <div className="qn-nav">
              {order.map((rowIndex, pos) => {
                const n = pos + 1;
                const isActive = pos === idxInOrder;
                const question = filteredRows[rowIndex];
                const progress = getQuestionProgressWithUpdates(question?.id);

                return (
                  <button
                    key={n}
                    ref={isActive ? activeRef : undefined}
                    onClick={() => setIndex(n)}
                    onKeyDown={(e) => keyGo(e, n)}
                    className={`qn-tile ${isActive ? "qn-tile--active" : ""} ${
                      progress?.status === "correct"
                        ? "qn-tile--correct"
                        : progress?.status === "incorrect"
                        ? "qn-tile--incorrect"
                        : progress?.status === "flagged"
                        ? "qn-tile--flagged"
                        : ""
                    }`}
                    aria-current={isActive ? "true" : "false"}
                    aria-label={`Go to question ${n}${
                      progress?.status ? ` (${progress.status})` : ""
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Dark theme styles for navigator/buttons */}
      <style jsx>{`
        .qn-nav {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
        }
        .qn-tile {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.8);
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          backdrop-filter: blur(8px);
        }
        .qn-tile:hover {
          border-color: rgba(59, 130, 246, 0.4);
          background: rgba(59, 130, 246, 0.1);
          transform: scale(1.05);
        }
        .qn-tile--active {
          border-color: rgb(59, 130, 246);
          background: rgb(59, 130, 246);
          color: #fff;
          transform: scale(1.1);
        }
        .qn-tile--correct {
          border-color: rgb(34, 197, 94);
          background: rgba(34, 197, 94, 0.2);
          color: rgb(74, 222, 128);
        }
        .qn-tile--correct.qn-tile--active {
          background: rgb(34, 197, 94);
          color: #fff;
        }
        .qn-tile--incorrect {
          border-color: rgb(239, 68, 68);
          background: rgba(239, 68, 68, 0.2);
          color: rgb(248, 113, 113);
        }
        .qn-tile--incorrect.qn-tile--active {
          background: rgb(239, 68, 68);
          color: #fff;
        }
        .qn-tile--flagged {
          border-color: rgb(245, 158, 11);
          background: rgba(245, 158, 11, 0.2);
          color: rgb(251, 191, 36);
        }
        .qn-tile--flagged.qn-tile--active {
          background: rgb(245, 158, 11);
          color: #fff;
        }
        .qn-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 8px 16px;
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.8);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          backdrop-filter: blur(8px);
        }
        .qn-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.3);
          color: #fff;
        }
      `}</style>
    </div>
  );
}
