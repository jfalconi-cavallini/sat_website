"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// Re-using types partially from QuestionViewer, but keeping it standalone for simplicity
type QuestionData = {
    id: string;
    stem?: string;
    stem_html?: string;
    choices?: any;
    correct_letters?: string | string[];
    answer?: string;
    rationale?: string;
    rationale_html?: string;
};

export default function ChatQuestionCard({ question }: { question: QuestionData }) {
    const [selected, setSelected] = useState<string | null>(null);
    const [showHint, setShowHint] = useState(false);
    const [showSolution, setShowSolution] = useState(false);

    // Normalize data
    const stem = question.stem || question.stem_html || "";
    const rationale = question.rationale || question.rationale_html || "";

    // Parse choices
    let parsedChoices: { key: string; text: string }[] = [];
    if (Array.isArray(question.choices)) {
        parsedChoices = question.choices.map((c: any, i: number) => ({
            key: c.key || c.letter || String.fromCharCode(65 + i),
            text: c.text || c.html || "",
        }));
    }

    // Correct Answer
    const correct = Array.isArray(question.correct_letters)
        ? question.correct_letters[0]
        : question.correct_letters || question.answer || "";

    const isCorrect = selected && selected === correct;
    const isIncorrect = selected && selected !== correct;

    return (
        <div className="mt-2 w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-4 text-slate-200">
            {/* Question Stem */}
            <div className="mb-4 text-sm prose prose-invert prose-p:my-1">
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {stem}
                </ReactMarkdown>
            </div>

            {/* Choices */}
            <div className="space-y-2">
                {parsedChoices.length > 0 ? (
                    parsedChoices.map((c) => (
                        <button
                            key={c.key}
                            onClick={() => setSelected(c.key)}
                            disabled={!!selected}
                            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-all ${selected === c.key
                                ? c.key === correct
                                    ? "border-green-500/50 bg-green-500/10 text-green-300"
                                    : "border-red-500/50 bg-red-500/10 text-red-300"
                                : selected && c.key === correct // Show correct answer if missed
                                    ? "border-green-500/50 bg-green-500/10 text-green-300"
                                    : "border-slate-600 bg-slate-700/50 hover:bg-slate-700 hover:border-slate-500"
                                }`}
                        >
                            <span className="font-bold">{c.key}.</span>
                            <div className="prose prose-invert prose-sm">
                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                    {c.text}
                                </ReactMarkdown>
                            </div>
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
                <div className="rounded-b-lg bg-slate-700/30 px-3 py-2 text-xs text-slate-300 prose prose-invert prose-sm max-w-none">
                    <div className="font-bold mb-1 text-emerald-400">Answer: {correct}</div>
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {rationale || "No explanation available."}
                    </ReactMarkdown>
                </div>
            )}
        </div>
    );
}
