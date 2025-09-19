"use client";

import React, { useState, useEffect, useRef } from "react";

// Types
type DailyState = {
  rows: Question[];
  answers: Record<string, string>;
  flags: Record<string, boolean>;
  startedAt: number;
  remainingSeconds: number;
  submitted: boolean;
  result?: { score: number; percent: number; elapsedSeconds: number };
  profile?: { displayName: string; grade: "9" | "10" | "11" | "12" | "Other"; district?: string };
};

type LeaderboardEntry = {
  displayName: string;
  grade: string;
  district?: string;
  score: number;
  percent: number;
  elapsedSeconds: number;
  createdAt: string;
};

type Question = {
  id: string;
  __source?: string;
  domain_desc?: string;
  skill_desc?: string;
  stem_html?: string;
  stimulus_html?: string;
  stem?: string;
  stimulus?: string;
  choices?: { key: string; text?: string; html?: string; correct?: boolean }[];
  correct_letters?: string | string[];
  answer?: string;
  difficulty?: "E" | "M" | "H" | string;
  type?: string;
  media?: unknown;
  rationale_html?: string;
  rationale?: string;
};

type Choice = {
  key: string;
  text?: string;
  html?: string;
  correct?: boolean;
};

// Utilities
function getTodayKey(): string {
  return new Date().toISOString().split("T")[0];
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededPick<T>(seedStr: string, arr: T[], k: number): T[] {
  if (!arr.length) return [];
  const seed = seedStr.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const rng = mulberry32(seed);
  const shuffled = [...arr].sort(() => rng() - 0.5);
  return shuffled.slice(0, Math.min(k, shuffled.length));
}

// Enhanced function to pick balanced daily questions with progressive difficulty
function pickDailyQuestions(seedStr: string, allRows: Question[]): Question[] {
  if (!allRows.length) return [];

  const englishRows = allRows.filter((row) => row.__source === "English");
  const mathRows = allRows.filter((row) => row.__source === "Math");

  const sortByDifficulty = (rows: Question[]) => {
    const easy = rows.filter((r) => r.difficulty === "E");
    const medium = rows.filter((r) => r.difficulty === "M");
    const hard = rows.filter((r) => r.difficulty === "H");
    return [...easy, ...medium, ...hard];
  };

  const englishSorted = sortByDifficulty(englishRows);
  const mathSorted = sortByDifficulty(mathRows);

  const selectedEnglish = seededPick(seedStr + "-english", englishSorted, 5);
  const selectedMath = seededPick(seedStr + "-math", mathSorted, 5);

  // Interleave
  const dailyQuestions: Question[] = [];
  const maxLength = Math.max(selectedEnglish.length, selectedMath.length);
  for (let i = 0; i < maxLength; i++) {
    if (i < selectedEnglish.length) dailyQuestions.push(selectedEnglish[i]);
    if (i < selectedMath.length) dailyQuestions.push(selectedMath[i]);
  }

  return dailyQuestions.slice(0, 10);
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function validateDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    return "Name must be 2-20 characters";
  }
  if (!/^[a-zA-Z0-9\s]+$/.test(trimmed)) {
    return "Only letters, numbers, and spaces allowed";
  }
  const denylist = ["badword", "test"];
  if (denylist.some((word) => trimmed.toLowerCase().includes(word))) {
    return "Please choose a different name";
  }
  return null;
}

function loadDailyState(dateKey: string): DailyState | null {
  try {
    const stored = localStorage.getItem(`daily-${dateKey}`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveDailyState(dateKey: string, state: DailyState): void {
  try {
    localStorage.setItem(`daily-${dateKey}`, JSON.stringify(state));
  } catch {
    // localStorage unavailable
  }
}

function inferSubject(row: any): 'English' | 'Math' {
  // Prefer explicit field if present
  if (row.__source === 'English' || row.__source === 'Math') return row.__source;

  // Heuristics: SAT ELA domains → English
  const englishDomains = [
    'Information and Ideas',
    'Craft and Structure',
    'Central Ideas and Details',
    'Words in Context',
    'Command of Evidence',
    'Expression of Ideas',
    'Standard English Conventions',
    'Text Structure',
    'Text Structure & Purpose'
  ];
  const domain = (row.domain_desc || row.domain || '').toString();
  if (englishDomains.some(d => domain.includes(d))) return 'English';

  // Math keyword hints in text/HTML → Math
  const blob = (
    row.stem_html || row.stem || row.stimulus_html || row.stimulus || ''
  ).toString().toLowerCase();

  if (/\b(quadratic|linear|function|equation|graph|slope|system|ratio|percent|mean|median|mode|probability|geometry|triangle|circle)\b/.test(blob)) {
    return 'Math';
  }

  // Default to English if unsure
  return 'English';
}

// Mini inline question viewer fallback
function MiniQuestionViewer({
  rows,
  currentIndex,
  answers,
  flags,
  onAnswer,
  onFlag,
  onNavigate,
  onSubmit,
  submitted,
}: {
  rows: Question[];
  currentIndex: number;
  answers: Record<string, string>;
  flags: Record<string, boolean>;
  onAnswer: (questionId: string, answer: string) => void;
  onFlag: (questionId: string) => void;
  onNavigate: (direction: "prev" | "next") => void;
  onSubmit: () => void;
  submitted: boolean;
}) {
  const question = rows[currentIndex];
  if (!question) return null;

  const questionId = question.id;
  const userAnswer = answers[questionId] || "";
  const isFlagged = flags[questionId] || false;

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (submitted) return;
    if (e.key >= "1" && e.key <= "4" && question.choices) {
      const choiceIndex = parseInt(e.key) - 1;
      if (question.choices[choiceIndex]) {
        onAnswer(questionId, question.choices[choiceIndex].key);
      }
    }
  };

  const getCorrectAnswer = (q: Question) => {
    if (Array.isArray(q.correct_letters)) return q.correct_letters[0] ?? "";
    return q.correct_letters || q.answer || "";
  };

  const answerIsCorrect = submitted && userAnswer === getCorrectAnswer(question);

  return (
    <div className="space-y-6" onKeyDown={handleKeyPress} tabIndex={-1}>
      {/* Question Content */}
      <div className="bg-slate-900/70 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-cyan-500/5 rounded-2xl"></div>

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="text-slate-400 text-sm flex items-center gap-2">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                {question.__source || "Question"} • {question.domain_desc || "General"} • {question.skill_desc || "Skills"}
              </div>
            </div>
            <button
              onClick={() => onFlag(questionId)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all transform hover:scale-105 ${
                isFlagged
                  ? "bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 border border-amber-500/30 shadow-lg shadow-amber-500/20"
                  : "bg-slate-800/50 text-slate-400 border border-slate-600/50 hover:bg-slate-700/50 hover:border-slate-500/50"
              }`}
            >
              {isFlagged ? "🚩 Flagged" : "🏳️ Flag"}
            </button>
          </div>

          {/* Question content */}
          <div className="space-y-6 mb-8">
            {(question.stimulus_html || question.stimulus) && (
              <div className="bg-slate-800/40 backdrop-blur-sm rounded-xl border border-slate-700/30 p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 via-purple-500 to-cyan-400"></div>
                <div
                  className="text-slate-200 text-base leading-relaxed relative z-10"
                  dangerouslySetInnerHTML={{
                    __html: question.stimulus_html || question.stimulus || "",
                  }}
                />
              </div>
            )}

            <div
              className="text-white text-lg leading-relaxed font-medium"
              dangerouslySetInnerHTML={{
                __html: question.stem_html || question.stem || "No question content",
              }}
            />
          </div>

          {/* Answer Options */}
          {question.type === "spr" ? (
            <div className="relative">
              <input
                type="text"
                value={userAnswer}
                onChange={(e) => !submitted && onAnswer(questionId, e.target.value)}
                disabled={submitted}
                className="w-full p-4 bg-slate-800/50 backdrop-blur-sm border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-50 disabled:bg-slate-800/30 transition-all"
                placeholder="Type your answer..."
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent opacity-0 focus-within:opacity-100 transition-opacity pointer-events-none rounded-xl"></div>
            </div>
          ) : question.choices ? (
            <div className="space-y-4">
              {question.choices.map((choice: Choice) => {
                const isSelected = userAnswer === choice.key;
                const isThisCorrect = submitted && choice.key === getCorrectAnswer(question);
                const isWrong = submitted && isSelected && !isThisCorrect;

                return (
                  <label
                    key={choice.key}
                    className={`
                      flex items-center p-4 rounded-xl border cursor-pointer transition-all transform hover:scale-[1.02] relative overflow-hidden group
                      ${isSelected && !submitted ? "bg-cyan-500/10 border-cyan-400/50 shadow-lg shadow-cyan-400/10" : "bg-slate-800/30 backdrop-blur-sm border-slate-700/50 hover:border-slate-600/50 hover:bg-slate-800/40"}
                      ${isThisCorrect ? "bg-emerald-500/10 border-emerald-400/50 shadow-lg shadow-emerald-400/10" : ""}
                      ${isWrong ? "bg-red-500/10 border-red-400/50 shadow-lg shadow-red-400/10" : ""}
                      ${submitted ? "cursor-default" : ""}
                    `}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                    <input
                      type="radio"
                      name={`question-${questionId}`}
                      value={choice.key}
                      checked={isSelected}
                      onChange={() => !submitted && onAnswer(questionId, choice.key)}
                      disabled={submitted}
                      className="sr-only"
                    />
                    <div
                      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center mr-4 text-sm font-bold relative z-10 ${
                        isThisCorrect
                          ? "border-emerald-400 text-emerald-300 bg-emerald-400/10"
                          : isWrong
                          ? "border-red-400 text-red-300 bg-red-400/10"
                          : isSelected
                          ? "border-cyan-400 text-cyan-300 bg-cyan-400/10"
                          : "border-slate-500 text-slate-400 group-hover:border-slate-400 group-hover:text-slate-300"
                      }`}
                    >
                      {choice.key}
                      {isThisCorrect && <div className="absolute inset-0 bg-emerald-400/20 rounded-full animate-pulse"></div>}
                      {isWrong && <div className="absolute inset-0 bg-red-400/20 rounded-full animate-pulse"></div>}
                    </div>

                    {/* Choice text: prefer HTML if present */}
                    {choice.html ? (
                      <span
                        className={`flex-1 relative z-10 ${
                          isThisCorrect ? "text-emerald-200" : isWrong ? "text-red-200" : isSelected ? "text-cyan-200" : "text-slate-200"
                        }`}
                        dangerouslySetInnerHTML={{ __html: choice.html }}
                      />
                    ) : (
                      <span
                        className={`flex-1 relative z-10 ${
                          isThisCorrect ? "text-emerald-200" : isWrong ? "text-red-200" : isSelected ? "text-cyan-200" : "text-slate-200"
                        }`}
                      >
                        {choice.text ?? choice.key}
                      </span>
                    )}

                    {submitted && answerIsCorrect && <span className="text-emerald-400 ml-2 text-lg">✓</span>}
                    {submitted && isWrong && <span className="text-red-400 ml-2 text-lg">✗</span>}
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="text-slate-400 italic text-center py-8">No answer options available</div>
          )}

          {/* Question Navigator (visible during quiz) */}
          {!submitted && (
            <div className="mt-8 bg-slate-800/40 backdrop-blur-sm rounded-xl border border-slate-700/30 p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-400 via-purple-500 to-pink-400"></div>
              
              <div className="relative z-10">
                <div className="mb-4 text-sm text-slate-400 text-center font-medium">
                  <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">Question Navigator</span> • Click to jump to any question
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
                          if (diff !== 0) {
                            const direction = diff > 0 ? "next" : "prev";
                            for (let i = 0; i < Math.abs(diff); i++) onNavigate(direction);
                          }
                        }}
                        className={`
                          w-12 h-12 rounded-xl border transition-all text-sm font-bold relative overflow-hidden transform hover:scale-110
                          ${
                            isActive
                              ? "bg-gradient-to-r from-cyan-600 to-blue-600 border-cyan-500 text-white scale-110 shadow-lg shadow-cyan-500/30"
                              : hasAnswer
                              ? "bg-gradient-to-r from-emerald-600/20 to-green-600/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-600/30 shadow-lg shadow-emerald-500/10"
                              : isFlagged
                              ? "bg-gradient-to-r from-amber-600/20 to-orange-600/20 border-amber-500/50 text-amber-300 hover:bg-amber-600/30 shadow-lg shadow-amber-500/10"
                              : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-700/50 hover:border-slate-600/50 hover:text-slate-300"
                          }
                        `}
                      >
                        {isActive && <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/20 to-blue-400/20 rounded-xl animate-pulse"></div>}
                        <span className="relative z-10">{index + 1}</span>
                        {isFlagged && !isActive && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full text-[8px] text-white flex items-center justify-center font-black shadow-lg">
                            !
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex justify-center gap-8 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-600 rounded"></div>
                    <span>Current</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-emerald-600/40 border border-emerald-500/50 rounded"></div>
                    <span>Answered</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-amber-600/40 border border-amber-500/50 rounded relative">
                      <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full"></div>
                    </div>
                    <span>Flagged</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-slate-800/50 border border-slate-700/50 rounded"></div>
                    <span>Unanswered</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Explanation */}
          {submitted && (question.rationale_html || question.rationale) && (
            <div className="mt-8 p-6 bg-slate-800/40 backdrop-blur-sm rounded-xl border border-slate-700/30 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-400 to-pink-400"></div>
              <h4 className="text-purple-300 font-semibold mb-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                Explanation:
              </h4>
              <div
                className="text-slate-300 text-sm leading-relaxed relative z-10"
                dangerouslySetInnerHTML={{ __html: question.rationale_html || question.rationale || "" }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onNavigate("prev")}
          disabled={currentIndex === 0}
          className="px-6 py-3 bg-slate-800/50 backdrop-blur-sm hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl border border-slate-700/50 transition-all hover:scale-105 hover:shadow-lg disabled:hover:scale-100 font-medium"
        >
          ← Previous
        </button>

        <div className="flex items-center gap-4">
          <div className="text-slate-400 text-sm font-medium">Question {currentIndex + 1} of {rows.length}</div>
          <button
            onClick={onSubmit}
            disabled={submitted}
            className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl border border-emerald-500 transition-all hover:scale-105 hover:shadow-lg hover:shadow-emerald-500/20 font-medium"
          >
            Submit Quiz
          </button>
        </div>

        {currentIndex < rows.length - 1 ? (
          <button
            onClick={() => onNavigate("next")}
            className="px-6 py-3 bg-slate-800/50 backdrop-blur-sm hover:bg-slate-700/50 text-white rounded-xl border border-slate-700/50 transition-all hover:scale-105 hover:shadow-lg font-medium"
          >
            Next →
          </button>
        ) : (
          <div className="w-[100px]"></div>
        )}
      </div>
    </div>
  );
}

// =================== Page ===================

export default function DailyPage() {
  const [state, setState] = useState<DailyState | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [profileData, setProfileData] = useState<{ displayName: string; grade: "9" | "10" | "11" | "12" | "Other"; district: string }>({
    displayName: "",
    grade: "11",
    district: "",
  });
  const [profileError, setProfileError] = useState("");
  const [leaderboards, setLeaderboards] = useState<Record<string, LeaderboardEntry[]>>({});
  const [leaderboardTab, setLeaderboardTab] = useState("All");
  const [apiError, setApiError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dateKey = getTodayKey();

  const handleSubmit = React.useCallback(() => {
    if (!state || state.submitted) return;

    // Calculate score
    let correct = 0;
    state.rows.forEach((row) => {
      const userAnswer = state.answers[row.id] || "";
      const correctAnswer = Array.isArray(row.correct_letters) ? row.correct_letters[0] : row.correct_letters || row.answer || "";
      if (userAnswer === correctAnswer) correct++;
    });

    const elapsedSeconds = 720 - state.remainingSeconds;
    const resultData = {
      score: correct,
      percent: Math.round((correct / state.rows.length) * 100),
      elapsedSeconds,
    };

    const updatedState: DailyState = {
      ...state,
      submitted: true,
      result: resultData,
    };

    setState(updatedState);
    saveDailyState(dateKey, updatedState);

    if (!updatedState.profile) setShowProfile(true);
  }, [state, dateKey]);

  const handleAnswer = (questionId: string, answer: string) => {
    if (!state || state.submitted) return;
    const updatedState = { ...state, answers: { ...state.answers, [questionId]: answer } };
    setState(updatedState);
    saveDailyState(dateKey, updatedState);
  };

  const handleFlag = (questionId: string) => {
    if (!state || state.submitted) return;
    const updatedState = { ...state, flags: { ...state.flags, [questionId]: !state.flags[questionId] } };
    setState(updatedState);
    saveDailyState(dateKey, updatedState);
  };

  const handleNavigate = (direction: "prev" | "next") => {
    if (!state) return;
    if (direction === "prev" && currentQuestionIndex > 0) setCurrentQuestionIndex((i) => i - 1);
    else if (direction === "next" && currentQuestionIndex < state.rows.length - 1) setCurrentQuestionIndex((i) => i + 1);
  };

  const fetchLeaderboards = React.useCallback(async () => {
    try {
      const tabs = ["All", "9", "10", "11", "12"];
      const boards: Record<string, LeaderboardEntry[]> = {};

      for (const tab of tabs) {
        const url = tab === "All" ? `/api/leaderboard?date=${dateKey}` : `/api/leaderboard?date=${dateKey}&grade=${tab}`;
        const response = await fetch(url);
        if (response.ok) {
          boards[tab] = (await response.json()) as LeaderboardEntry[];
        }
      }
      setLeaderboards(boards);
    } catch (error) {
      console.warn("Failed to fetch leaderboards:", error);
    }
  }, [dateKey]);

  const handleProfileSubmit = async () => {
    const nameError = validateDisplayName(profileData.displayName);
    if (nameError) {
      setProfileError(nameError);
      return;
    }
    if (!state?.result) return;

    const profile = {
      displayName: profileData.displayName.trim(),
      grade: profileData.grade,
      district: profileData.district.trim() || undefined,
    };

    const updatedState: DailyState = { ...state, profile };
    setState(updatedState);
    saveDailyState(dateKey, updatedState);

    try {
      await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateKey,
          displayName: profile.displayName,
          grade: profile.grade,
          district: profile.district,
          score: state.result.score,
          percent: state.result.percent,
          elapsedSeconds: state.result.elapsedSeconds,
          createdAt: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.warn("Failed to submit to leaderboard:", error);
    }

    setShowProfile(false);
    await fetchLeaderboards();
  };

  // Initialize or load state
  useEffect(() => {
    async function initializeDaily() {
      setIsLoading(true);

      const existingState = loadDailyState(dateKey);
      if (existingState?.rows.length) {
        setState(existingState);
        setIsLoading(false);
        if (existingState.submitted && existingState.result) setShowProfile(!existingState.profile);
        return;
      }

      let questionPool: Question[] = [];
      try {
        const response = await fetch("/api/qbank?subjects=english,math");
        if (response.ok) {
          questionPool = (await response.json()) as Question[];
          if (!questionPool.length) throw new Error("No questions returned from API");
        } else {
          throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }
        
        // Normalize missing __source so pickDailyQuestions can balance subjects
        questionPool = questionPool.map(q => ({
          ...q,
          __source: q.__source || inferSubject(q),
        }));
      } catch (error) {
        console.error("Failed to fetch questions:", error);
        setApiError("Unable to load questions. Please check that your question bank files are properly set up.");
        setIsLoading(false);
        return;
      }

      const englishCount = questionPool.filter((q) => q.__source === "English").length;
      const mathCount = questionPool.filter((q) => q.__source === "Math").length;

      if (englishCount < 5 || mathCount < 5) {
        setApiError(
          `Insufficient questions available. Need at least 5 English and 5 Math questions. Found: ${englishCount} English, ${mathCount} Math.`
        );
        setIsLoading(false);
        return;
      }

      const dailyQuestions = pickDailyQuestions(dateKey, questionPool);
      if (dailyQuestions.length < 10) {
        setApiError("Unable to generate a complete daily quiz. Please ensure your question bank has sufficient variety.");
        setIsLoading(false);
        return;
      }

      const newState: DailyState = {
        rows: dailyQuestions,
        answers: {},
        flags: {},
        startedAt: Date.now(),
        remainingSeconds: 720, // 12 minutes
        submitted: false,
      };

      setState(newState);
      saveDailyState(dateKey, newState);
      setIsLoading(false);
    }

    initializeDaily();
  }, [dateKey]);

  // Timer logic
  useEffect(() => {
    if (!state || state.submitted) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (state.remainingSeconds <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      handleSubmit();
      return;
    }

    const tick = () => {
      if (document.hidden) return; // Pause when tab not visible
      setState((prevState) => {
        if (!prevState || prevState.submitted) return prevState;
        const newSeconds = prevState.remainingSeconds - 1;
        const updatedState = { ...prevState, remainingSeconds: Math.max(0, newSeconds) };
        saveDailyState(dateKey, updatedState);
        if (newSeconds <= 0) {
          setTimeout(() => {
            handleSubmit();
          }, 100);
        }
        return updatedState;
      });
    };

    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.submitted, state?.remainingSeconds, dateKey, handleSubmit]);

  // Load leaderboards on mount if already submitted
  useEffect(() => {
    if (state?.submitted && !showProfile) {
      fetchLeaderboards();
    }
  }, [state?.submitted, showProfile, fetchLeaderboards]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">Loading today&apos;s Daily SAT...</div>
          <div className="text-slate-400">Fetching questions from your question bank</div>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center max-w-2xl mx-auto px-4">
          <div className="text-red-400 text-xl mb-4">Unable to Load Daily SAT</div>
          <div className="text-slate-300 mb-6">
            {apiError || "Failed to load the daily quiz. Please ensure your question bank files are properly configured."}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl border border-indigo-500 transition-all hover:scale-105"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="bg-slate-900/90 backdrop-blur-sm border-b border-slate-700/50 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-purple-500 to-cyan-400 bg-clip-text text-transparent">
                Daily SAT
              </h1>
              <p className="text-slate-400 text-sm">
                {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>

            {!state.submitted && (
              <div className="flex items-center gap-4">
                <div className="text-slate-300">Question {currentQuestionIndex + 1} of {state.rows.length}</div>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-xl border border-slate-600/50">
                  <span className="text-2xl">⏱️</span>
                  <span className="text-white font-mono text-lg">{formatTime(state.remainingSeconds)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {apiError && <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-200">{apiError}</div>}

        {/* Quiz Interface */}
        {!state.submitted ? (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-slate-300">Complete 10 questions in 12 minutes • Save & resume anytime</p>
            </div>
            <MiniQuestionViewer
              rows={state.rows}
              currentIndex={currentQuestionIndex}
              answers={state.answers}
              flags={state.flags}
              onAnswer={handleAnswer}
              onFlag={handleFlag}
              onNavigate={handleNavigate}
              onSubmit={handleSubmit}
              submitted={false}
            />
          </div>
        ) : (
          /* Results and Leaderboard */
          <div className="space-y-8">
            {/* Results Card */}
            <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8 text-center">
              <h2 className="text-3xl font-bold text-white mb-4">Quiz Complete!</h2>
              {state.result && (
                <div className="grid grid-cols-3 gap-6 max-w-lg mx-auto">
                  <div>
                    <div className="text-2xl font-bold text-indigo-400">{state.result.score}/10</div>
                    <div className="text-slate-400 text-sm">Score</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-emerald-400">{state.result.percent}%</div>
                    <div className="text-slate-400 text-sm">Accuracy</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-amber-400">{formatTime(state.result.elapsedSeconds)}</div>
                    <div className="text-slate-400 text-sm">Time</div>
                  </div>
                </div>
              )}
            </div>

            {/* Review Table */}
            <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Review</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-2 text-slate-300">#</th>
                      <th className="text-left py-2 text-slate-300">Subject</th>
                      <th className="text-left py-2 text-slate-300">Domain</th>
                      <th className="text-left py-2 text-slate-300">Skill</th>
                      <th className="text-left py-2 text-slate-300">Your Answer</th>
                      <th className="text-left py-2 text-slate-300">Correct</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.rows.map((row, index) => {
                      const userAnswer = state.answers[row.id] || "—";
                      const correctAnswer = Array.isArray(row.correct_letters)
                        ? row.correct_letters[0]
                        : row.correct_letters || row.answer || "—";
                      const isCorrect = userAnswer === correctAnswer;

                      return (
                        <tr key={row.id} className="border-b border-slate-800/50">
                          <td className="py-3 text-slate-300">{index + 1}</td>
                          <td className="py-3 text-slate-300">{row.__source || "General"}</td>
                          <td className="py-3 text-slate-300">{row.domain_desc || "—"}</td>
                          <td className="py-3 text-slate-300">{row.skill_desc || "—"}</td>
                          <td className="py-3">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                isCorrect ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
                              }`}
                            >
                              {userAnswer}
                            </span>
                          </td>
                          <td className="py-3">
                            <span className="px-2 py-1 bg-slate-700/50 text-slate-300 rounded text-xs font-medium">
                              {correctAnswer}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Profile Form */}
            {showProfile && (
              <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Join the Leaderboard</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl">
                  <div>
                    <label className="block text-slate-300 text-sm mb-2">Display Name *</label>
                    <input
                      type="text"
                      value={profileData.displayName}
                      onChange={(e) => setProfileData((prev) => ({ ...prev, displayName: e.target.value }))}
                      className="w-full p-3 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:border-indigo-400 focus:outline-none"
                      placeholder="Your name"
                      maxLength={20}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 text-sm mb-2">Grade</label>
                    <select
                      value={profileData.grade}
                      onChange={(e) => setProfileData((prev) => ({ ...prev, grade: e.target.value as "9" | "10" | "11" | "12" | "Other" }))}
                      className="w-full p-3 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white focus:border-indigo-400 focus:outline-none"
                    >
                      <option value="9">9th Grade</option>
                      <option value="10">10th Grade</option>
                      <option value="11">11th Grade</option>
                      <option value="12">12th Grade</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 text-sm mb-2">District (optional)</label>
                    <input
                      type="text"
                      value={profileData.district}
                      onChange={(e) => setProfileData((prev) => ({ ...prev, district: e.target.value }))}
                      className="w-full p-3 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:border-indigo-400 focus:outline-none"
                      placeholder="School district"
                      maxLength={40}
                    />
                  </div>
                </div>
                {profileError && <div className="mt-3 text-red-400 text-sm">{profileError}</div>}
                <div className="mt-6 flex gap-3">
                  <button onClick={handleProfileSubmit} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl border border-indigo-500 transition-all hover:scale-105">
                    Save & View Leaderboard
                  </button>
                  <button onClick={() => setShowProfile(false)} className="px-6 py-3 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-xl border border-slate-600/50 transition-all">
                    Skip
                  </button>
                </div>
              </div>
            )}

            {/* Leaderboards */}
            {!showProfile && Object.keys(leaderboards).length > 0 && (
              <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Leaderboards</h3>

                {/* Tabs */}
                <div className="flex gap-2 mb-6 overflow-x-auto">
                  {["All", "9", "10", "11", "12"].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setLeaderboardTab(tab)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                        leaderboardTab === tab ? "bg-indigo-600 text-white border border-indigo-500" : "bg-slate-700/50 text-slate-300 border border-slate-600/50 hover:bg-slate-600/50"
                      }`}
                    >
                      {tab === "All" ? "All Grades" : `${tab}th Grade`}
                    </button>
                  ))}
                </div>

                {/* Leaderboard Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left py-2 text-slate-300">#</th>
                        <th className="text-left py-2 text-slate-300">Name</th>
                        <th className="text-left py-2 text-slate-300">Grade</th>
                        <th className="text-left py-2 text-slate-300">District</th>
                        <th className="text-left py-2 text-slate-300">Score</th>
                        <th className="text-left py-2 text-slate-300">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(leaderboards[leaderboardTab] || []).slice(0, 20).map((entry, index) => {
                        const isCurrentUser = state.profile && entry.displayName === state.profile.displayName;
                        return (
                          <tr key={`${entry.displayName}-${entry.createdAt}`} className={`border-b border-slate-800/50 ${isCurrentUser ? "bg-indigo-500/10" : ""}`}>
                            <td className="py-3 text-slate-300">{index + 1}</td>
                            <td className="py-3">
                              <span className={`font-medium ${isCurrentUser ? "text-indigo-300" : "text-slate-200"}`}>
                                {entry.displayName}
                                {isCurrentUser && " (You)"}
                              </span>
                            </td>
                            <td className="py-3 text-slate-300">{entry.grade}th</td>
                            <td className="py-3 text-slate-400">{entry.district || "—"}</td>
                            <td className="py-3">
                              <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded text-xs font-medium">
                                {entry.score}/10 ({entry.percent}%)
                              </span>
                            </td>
                            <td className="py-3 text-slate-300">{formatTime(entry.elapsedSeconds)}</td>
                          </tr>
                        );
                      })}
                      {(leaderboards[leaderboardTab]?.length || 0) === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            No entries yet for this category
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Fallback if API unavailable */}
            {!showProfile && Object.keys(leaderboards).length === 0 && (
              <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8 text-center">
                <h3 className="text-xl font-semibold text-white mb-2">Leaderboards Coming Soon</h3>
                <p className="text-slate-400">We&apos;re working on connecting to our leaderboard service. Your results are saved locally!</p>
                {state.result && (
                  <div className="mt-4 inline-flex items-center gap-4 px-6 py-3 bg-slate-800/50 rounded-xl">
                    <span className="text-slate-300">Your Score:</span>
                    <span className="text-indigo-400 font-semibold">
                      {state.result.score}/10 ({state.result.percent}%)
                    </span>
                    <span className="text-slate-400">in {formatTime(state.result.elapsedSeconds)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Return Tomorrow */}
            <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6 text-center">
              <h3 className="text-xl font-semibold text-white mb-2">See You Tomorrow!</h3>
              <p className="text-slate-400">
                Come back tomorrow for a new set of 10 questions. Each day features a unique deterministic mix of Math and English
                problems that&apos;s the same for all students worldwide.
              </p>
              <p className="text-slate-500 text-sm mt-2">Quiz resets daily at midnight UTC</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}