"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatWordedMath, normalizeMathML, renderChoiceContent, type HtmlLikeChoice } from "@/lib/question-render";

// Re-using types partially from QuestionViewer, but keeping it standalone for simplicity.
// NOTE: this is the same shape the dataset uses elsewhere in the app — choices
// carry their real content in `text_html` (MathML), not `text`/`html`. Stored
// question content renders as native MathML via the shared question-render
// helpers, same as the question bank and daily challenge; KaTeX (used
// elsewhere in this chat widget) stays reserved for the bot's own freely
// generated prose, which is the content it actually applies to.
export type ChatChoice = HtmlLikeChoice & { letter?: string };

export type QuestionData = {
    id: string;
    stem?: string;
    stem_html?: string;
    choices?: ChatChoice[];
    correct_letters?: string | string[];
    answer?: string;
    rationale?: string;
    rationale_html?: string;
};

export default function ChatQuestionCard({ question }: { question: QuestionData }) {
    const [selected, setSelected] = useState<string | null>(null);
    const [showHint, setShowHint] = useState(false);
    const [showSolution, setShowSolution] = useState(false);

    // Prefer real MathML over the worded-text fallback, same priority as the
    // rest of the app.
    const stemHtml = question.stem_html
        ? normalizeMathML(question.stem_html)
        : formatWordedMath(question.stem || "No question content");
    const rationaleHtml = question.rationale_html
        ? normalizeMathML(question.rationale_html)
        : formatWordedMath(question.rationale || "");

    // Parse choices, assigning a display key when the source data doesn't provide one
    const parsedChoices: { key: string; choice: ChatChoice }[] = Array.isArray(question.choices)
        ? question.choices.map((c, i) => ({
            key: c.key || c.letter || String.fromCharCode(65 + i),
            choice: c,
        }))
        : [];

    // Correct Answer
    const correct = Array.isArray(question.correct_letters)
        ? question.correct_letters[0]
        : question.correct_letters || question.answer || "";

    const isCorrect = selected && selected === correct;
    const isIncorrect = selected && selected !== correct;

    return (
        <div className="mt-2 w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-4 text-slate-200">
            {/* Question Stem */}
            <div
                className="question-html mb-4 text-sm"
                dangerouslySetInnerHTML={{ __html: stemHtml }}
            />

            {/* Choices */}
            <div className="space-y-2">
                {parsedChoices.length > 0 ? (
                    parsedChoices.map(({ key, choice }) => (
                        <button
                            key={key}
                            onClick={() => setSelected(key)}
                            disabled={!!selected}
                            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-all ${selected === key
                                ? key === correct
                                    ? "border-green-500/50 bg-green-500/10 text-green-300"
                                    : "border-red-500/50 bg-red-500/10 text-red-300"
                                : selected && key === correct // Show correct answer if missed
                                    ? "border-green-500/50 bg-green-500/10 text-green-300"
                                    : "border-slate-600 bg-slate-700/50 hover:bg-slate-700 hover:border-slate-500"
                                }`}
                        >
                            <span className="font-bold">{key}.</span>
                            <span className="question-html text-sm">{renderChoiceContent(choice)}</span>
                        </button>
                    ))
                ) : (
                    <div className="text-sm italic text-slate-400">Free response question (check solution below)</div>
                )}
            </div>

            {/* Feedback */}
            {selected && (
                <div className={`mt-3 text-center text-sm font-semibold ${isCorrect ? "text-green-400" : "text-red-400"
                    }`}>
                    {isCorrect ? "Correct! 🎉" : "Not quite."}
                </div>
            )}

            {/* Dropdowns */}
            <div className="mt-4 space-y-2 border-t border-slate-700 pt-3">
                {/* Hint (Use rationale snippet or generic hint if needed) */}
                {!selected && (
                    <button
                        onClick={() => setShowHint(!showHint)}
                        className="flex w-full items-center justify-between rounded-lg bg-slate-700/30 px-3 py-2 text-xs font-medium text-indigo-300 hover:bg-slate-700/50"
                    >
                        <span>Need a Hint?</span>
                        {showHint ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                )}
                {showHint && (
                    <div className="mb-2 rounded-b-lg bg-slate-700/30 px-3 py-2 text-xs text-slate-300">
                        Try breaking the problem down into smaller steps. Look at the key variables.
                    </div>
                )}

                {/* Full Solution */}
                <button
                    onClick={() => setShowSolution(!showSolution)}
                    className="flex w-full items-center justify-between rounded-lg bg-slate-700/30 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-slate-700/50"
                >
                    <span>Show Solution</span>
                    {showSolution ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
            </div>

            {showSolution && (
                <div className="rounded-b-lg bg-slate-700/30 px-3 py-2 text-xs text-slate-300">
                    <div className="font-bold mb-1 text-emerald-400">Answer: {correct}</div>
                    <div
                        className="question-html"
                        dangerouslySetInnerHTML={{
                            __html: rationaleHtml || "No explanation available.",
                        }}
                    />
                </div>
            )}
        </div>
    );
}
