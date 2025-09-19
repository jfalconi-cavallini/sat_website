"use client";

import React, { useState, useEffect, useRef, Suspense } from 'react';

// Lazy import DailyQuestionViewer with fallback
const DailyQuestionViewer = React.lazy(() => 
  import('@/components/DailyQuestionViewer').catch(() => ({
    default: () => null // Fallback if component doesn't exist
  }))
);

// Types
type DailyState = {
  rows: Question[];
  answers: Record<string, string>;
  flags: Record<string, boolean>;
  startedAt: number;
  remainingSeconds: number;
  submitted: boolean;
  result?: { score: number; percent: number; elapsedSeconds: number };
  profile?: { displayName: string; grade: "9"|"10"|"11"|"12"|"Other"; district?: string };
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
  choices?: { key: string; text: string; correct?: boolean }[];
  correct_letters?: string | string[];
  answer?: string;
  difficulty?: string;
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
  return new Date().toISOString().split('T')[0];
}

function mulberry32(seed: number) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function seededPick<T>(seedStr: string, arr: T[], k: number): T[] {
  if (!arr.length) return [];
  const seed = seedStr.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const rng = mulberry32(seed);
  const shuffled = [...arr].sort(() => rng() - 0.5);
  return shuffled.slice(0, Math.min(k, shuffled.length));
}

// Enhanced function to pick balanced daily questions with progressive difficulty
function pickDailyQuestions(seedStr: string, allRows: Question[]): Question[] {
  if (!allRows.length) return [];
  
  // Separate by subject
  const englishRows = allRows.filter(row => row.__source === 'English');
  const mathRows = allRows.filter(row => row.__source === 'Math');
  
  // Function to sort by difficulty (E=Easy, M=Medium, H=Hard)
  const sortByDifficulty = (rows: Question[]) => {
    const easy = rows.filter(r => r.difficulty === 'E');
    const medium = rows.filter(r => r.difficulty === 'M');
    const hard = rows.filter(r => r.difficulty === 'H');
    
    return [...easy, ...medium, ...hard];
  };
  
  // Pick 5 from each subject with difficulty progression
  const englishSorted = sortByDifficulty(englishRows);
  const mathSorted = sortByDifficulty(mathRows);
  
  const selectedEnglish = seededPick(seedStr + '-english', englishSorted, 5);
  const selectedMath = seededPick(seedStr + '-math', mathSorted, 5);
  
  // Interleave English and Math for variety, maintaining difficulty progression
  const dailyQuestions: Question[] = [];
  const maxLength = Math.max(selectedEnglish.length, selectedMath.length);
  
  for (let i = 0; i < maxLength; i++) {
    if (i < selectedEnglish.length) dailyQuestions.push(selectedEnglish[i]);
    if (i < selectedMath.length) dailyQuestions.push(selectedMath[i]);
  }
  
  return dailyQuestions.slice(0, 10); // Ensure exactly 10 questions
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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
  if (denylist.some(word => trimmed.toLowerCase().includes(word))) {
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
  submitted
}: {
  rows: Question[];
  currentIndex: number;
  answers: Record<string, string>;
  flags: Record<string, boolean>;
  onAnswer: (questionId: string, answer: string) => void;
  onFlag: (questionId: string) => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  onSubmit: () => void;
  submitted: boolean;
}) {
  const question = rows[currentIndex];
  if (!question) return null;

  const questionId = question.id;
  const userAnswer = answers[questionId] || '';
  const isFlagged = flags[questionId] || false;

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (submitted) return;
    if (e.key >= '1' && e.key <= '4' && question.choices) {
      const choiceIndex = parseInt(e.key) - 1;
      if (question.choices[choiceIndex]) {
        onAnswer(questionId, question.choices[choiceIndex].key);
      }
    }
  };

  const getCorrectAnswer = (q: Question) => {
    if (Array.isArray(q.correct_letters)) return q.correct_letters[0];
    return q.correct_letters || q.answer || '';
  };

  // Check if answer is correct - used for styling
  const answerIsCorrect = submitted && userAnswer === getCorrectAnswer(question);

  return (
    <div className="space-y-6" onKeyDown={handleKeyPress} tabIndex={-1}>
      {/* Question Content */}
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-slate-400 text-sm">
            {question.__source || 'Question'} • {question.domain_desc || 'General'} • {question.skill_desc || 'Skills'}
          </span>
          <button
            onClick={() => onFlag(questionId)}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
              isFlagged 
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                : 'bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-600/50'
            }`}
          >
            {isFlagged ? 'Flagged' : 'Flag'}
          </button>
        </div>
        
        <div 
          className="text-white text-lg leading-relaxed mb-6"
          dangerouslySetInnerHTML={{ 
            __html: question.stem_html || question.stimulus_html || question.stem || question.stimulus || 'No question content'
          }}
        />

        {/* Answer Options */}
        {question.type === 'spr' ? (
          <input
            type="text"
            value={userAnswer}
            onChange={(e) => !submitted && onAnswer(questionId, e.target.value)}
            disabled={submitted}
            className="w-full p-4 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:border-indigo-400 focus:outline-none disabled:opacity-50"
            placeholder="Enter your answer"
          />
        ) : question.choices ? (
          <div className="space-y-3">
            {question.choices.map((choice: Choice) => {
              const isSelected = userAnswer === choice.key;
              const isThisCorrect = submitted && choice.key === getCorrectAnswer(question);
              const isWrong = submitted && isSelected && !isThisCorrect;
              
              return (
                <label 
                  key={choice.key} 
                  className={`
                    flex items-center p-4 rounded-xl border cursor-pointer transition-all
                    ${isSelected && !submitted ? 'bg-indigo-500/20 border-indigo-400' : 'bg-slate-800/30 border-slate-600/50 hover:border-slate-500'}
                    ${isThisCorrect ? 'bg-emerald-500/20 border-emerald-400' : ''}
                    ${isWrong ? 'bg-red-500/20 border-red-400' : ''}
                    ${submitted ? 'cursor-default' : ''}
                  `}
                >
                  <input
                    type="radio"
                    name={`question-${questionId}`}
                    value={choice.key}
                    checked={isSelected}
                    onChange={() => !submitted && onAnswer(questionId, choice.key)}
                    disabled={submitted}
                    className="sr-only"
                  />
                  <span className="w-8 h-8 rounded-full border-2 border-current flex items-center justify-center mr-4 text-sm font-medium">
                    {choice.key}
                  </span>
                  <span className="flex-1 text-white">
                    {choice.text || choice.html || choice.key}
                  </span>
                  {submitted && answerIsCorrect && <span className="text-emerald-400 ml-2">✓</span>}
                  {submitted && isWrong && <span className="text-red-400 ml-2">✗</span>}
                </label>
              );
            })}
          </div>
        ) : (
          <div className="text-slate-400 italic">No answer options available</div>
        )}

        {/* Show correct answer explanation only after submission */}
        {submitted && question.rationale_html && (
          <div className="mt-6 p-4 bg-slate-800/50 rounded-xl border border-slate-600/50">
            <h4 className="text-slate-300 font-medium mb-2">Explanation:</h4>
            <div 
              className="text-slate-300 text-sm"
              dangerouslySetInnerHTML={{ __html: question.rationale_html || question.rationale }}
            />
          </div>
        )}
      </div>

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
          
          {/* Submit Quiz button - always available */}
          <button
            onClick={onSubmit}
            disabled={submitted}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl border border-emerald-500 transition-all hover:scale-105"
          >
            Submit Quiz
          </button>
        </div>
        
        {currentIndex < rows.length - 1 ? (
          <button
            onClick={() => onNavigate('next')}
            className="px-6 py-3 bg-slate-700/50 hover:bg-slate-600/50 text-white rounded-xl border border-slate-600/50 transition-all hover:scale-105"
          >
            Next →
          </button>
        ) : (
          <div className="w-[100px]"></div> // Spacer to maintain layout
        )}
      </div>
    </div>
  );
}

export default function DailyPage() {
  const [state, setState] = useState<DailyState | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [profileData, setProfileData] = useState({ displayName: '', grade: '11' as const, district: '' });
  const [profileError, setProfileError] = useState('');
  const [leaderboards, setLeaderboards] = useState<Record<string, LeaderboardEntry[]>>({});
  const [leaderboardTab, setLeaderboardTab] = useState('All');
  const [apiError, setApiError] = useState<string | null>(null);
  const [useQuestionViewer] = useState(false); // Set to false for now to use mini viewer

  const timerRef = useRef<NodeJS.Timeout>();
  const dateKey = getTodayKey();

  const handleSubmit = React.useCallback(() => {
    if (!state || state.submitted) return;

    // Calculate score
    let correct = 0;
    state.rows.forEach(row => {
      const userAnswer = state.answers[row.id] || '';
      const correctAnswer = Array.isArray(row.correct_letters) 
        ? row.correct_letters[0] 
        : row.correct_letters || row.answer || '';
      
      if (userAnswer === correctAnswer) correct++;
    });

    const elapsedSeconds = 720 - state.remainingSeconds;
    const resultData = {
      score: correct,
      percent: Math.round((correct / state.rows.length) * 100),
      elapsedSeconds
    };

    const updatedState = {
      ...state,
      submitted: true,
      result: resultData
    };

    setState(updatedState);
    saveDailyState(dateKey, updatedState);
    
    // Show profile form if not already filled
    if (!updatedState.profile) {
      setShowProfile(true);
    }
  }, [state, dateKey]);

  const handleAnswer = (questionId: string, answer: string) => {
    if (!state || state.submitted) return;
    
    const updatedState = {
      ...state,
      answers: { ...state.answers, [questionId]: answer }
    };
    setState(updatedState);
    saveDailyState(dateKey, updatedState);
  };

  const handleFlag = (questionId: string) => {
    if (!state || state.submitted) return;
    
    const updatedState = {
      ...state,
      flags: { ...state.flags, [questionId]: !state.flags[questionId] }
    };
    setState(updatedState);
    saveDailyState(dateKey, updatedState);
  };

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (!state) return;
    
    if (direction === 'prev' && currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    } else if (direction === 'next' && currentQuestionIndex < state.rows.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const fetchLeaderboards = React.useCallback(async () => {
    try {
      const tabs = ['All', '9', '10', '11', '12'];
      const boards: Record<string, LeaderboardEntry[]> = {};
      
      for (const tab of tabs) {
        const url = tab === 'All' 
          ? `/api/leaderboard?date=${dateKey}`
          : `/api/leaderboard?date=${dateKey}&grade=${tab}`;
        
        const response = await fetch(url);
        if (response.ok) {
          boards[tab] = await response.json() as LeaderboardEntry[];
        }
      }
      
      setLeaderboards(boards);
    } catch (error) {
      console.warn('Failed to fetch leaderboards:', error);
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
      district: profileData.district.trim() || undefined
    };

    // Update local state
    const updatedState = { ...state, profile };
    setState(updatedState);
    saveDailyState(dateKey, updatedState);

    // Submit to leaderboard
    try {
      await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateKey,
          displayName: profile.displayName,
          grade: profile.grade,
          district: profile.district,
          score: state.result.score,
          percent: state.result.percent,
          elapsedSeconds: state.result.elapsedSeconds,
          createdAt: new Date().toISOString()
        })
      });
    } catch (error) {
      console.warn('Failed to submit to leaderboard:', error);
    }

    setShowProfile(false);
    await fetchLeaderboards();
  };

  // Initialize or load state
  useEffect(() => {
    async function initializeDaily() {
      setIsLoading(true);
      
      // Check if quiz already taken today (device-based restriction)
      const existingState = loadDailyState(dateKey);
      if (existingState?.rows.length) {
        setState(existingState);
        setIsLoading(false);
        if (existingState.submitted && existingState.result) {
          setShowProfile(!existingState.profile);
        }
        return;
      }

      // Fetch question pool from actual JSON files
      let questionPool: Question[] = [];
      try {
        const response = await fetch('/api/qbank?subjects=english,math');
        if (response.ok) {
          questionPool = await response.json() as Question[];
          if (!questionPool.length) {
            throw new Error('No questions returned from API');
          }
        } else {
          throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.error('Failed to fetch questions:', error);
        setApiError('Unable to load questions. Please check that your question bank files are properly set up.');
        setIsLoading(false);
        return;
      }

      // Validate we have both subjects
      const englishCount = questionPool.filter(q => q.__source === 'English').length;
      const mathCount = questionPool.filter(q => q.__source === 'Math').length;
      
      if (englishCount < 5 || mathCount < 5) {
        setApiError(`Insufficient questions available. Need at least 5 English and 5 Math questions. Found: ${englishCount} English, ${mathCount} Math.`);
        setIsLoading(false);
        return;
      }

      // Generate today's deterministic set with balanced mix and difficulty progression
      const dailyQuestions = pickDailyQuestions(dateKey, questionPool);
      
      if (dailyQuestions.length < 10) {
        setApiError('Unable to generate a complete daily quiz. Please ensure your question bank has sufficient variety.');
        setIsLoading(false);
        return;
      }

      const newState: DailyState = {
        rows: dailyQuestions,
        answers: {},
        flags: {},
        startedAt: Date.now(),
        remainingSeconds: 720, // 12 minutes
        submitted: false
      };

      setState(newState);
      saveDailyState(dateKey, newState);
      setIsLoading(false);
    }

    initializeDaily();
  }, [dateKey]);

  // Timer logic - ESLint disable needed here because we intentionally don't want
  // to restart the timer every time state changes - only when specific fields change
  useEffect(() => {
    // If no state or quiz is already submitted, don't start timer
    if (!state || state.submitted) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = undefined;
      }
      return;
    }

    // If time is already up, don't start timer
    if (state.remainingSeconds <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = undefined;
      }
      handleSubmit();
      return;
    }

    const tick = () => {
      if (document.hidden) return; // Pause when tab not visible

      setState(prevState => {
        if (!prevState || prevState.submitted) return prevState;
        
        const newSeconds = prevState.remainingSeconds - 1;
        const updatedState = { ...prevState, remainingSeconds: Math.max(0, newSeconds) };
        
        saveDailyState(dateKey, updatedState);
        
        // Auto-submit when timer reaches 0
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
        timerRef.current = undefined;
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
            {apiError || 'Failed to load the daily quiz. Please ensure your question bank files are properly configured.'}
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
              <h1 className="text-2xl font-bold text-white">Daily SAT</h1>
              <p className="text-slate-400 text-sm">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            
            {!state.submitted && (
              <div className="flex items-center gap-4">
                <div className="text-slate-300">
                  Question {currentQuestionIndex + 1} of {state.rows.length}
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-xl border border-slate-600/50">
                  <span className="text-2xl">⏱️</span>
                  <span className="text-white font-mono text-lg">
                    {formatTime(state.remainingSeconds)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {apiError && (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-200">
            {apiError}
          </div>
        )}

        {/* Quiz Interface */}
        {!state.submitted ? (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-slate-300">
                Complete 10 questions in 12 minutes • Save & resume anytime
              </p>
            </div>

            {useQuestionViewer ? (
              <Suspense fallback={
                <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8 text-center">
                  <div className="text-slate-400">Loading question viewer...</div>
                </div>
              }>
                <DailyQuestionViewer
                  rows={state.rows}
                  currentIndex={currentQuestionIndex}
                  answers={state.answers}
                  flags={state.flags}
                  onAnswerSelect={handleAnswer}
                  onFlag={handleFlag}
                  onNavigate={handleNavigate}
                  onSubmit={handleSubmit}
                  isSubmitted={state.submitted}
                  result={state.result}
                />
              </Suspense>
            ) : (
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
            )}
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
                      const userAnswer = state.answers[row.id] || '—';
                      const correctAnswer = Array.isArray(row.correct_letters) 
                        ? row.correct_letters[0] 
                        : row.correct_letters || row.answer || '—';
                      const isCorrect = userAnswer === correctAnswer;
                      
                      return (
                        <tr key={row.id} className="border-b border-slate-800/50">
                          <td className="py-3 text-slate-300">{index + 1}</td>
                          <td className="py-3 text-slate-300">{row.__source || 'General'}</td>
                          <td className="py-3 text-slate-300">{row.domain_desc || '—'}</td>
                          <td className="py-3 text-slate-300">{row.skill_desc || '—'}</td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              isCorrect ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                            }`}>
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
                      onChange={(e) => setProfileData(prev => ({ ...prev, displayName: e.target.value }))}
                      className="w-full p-3 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:border-indigo-400 focus:outline-none"
                      placeholder="Your name"
                      maxLength={20}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 text-sm mb-2">Grade</label>
                    <select
                      value={profileData.grade}
                      onChange={(e) => setProfileData(prev => ({ ...prev, grade: e.target.value as "9"|"10"|"11"|"12"|"Other" }))}
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
                      onChange={(e) => setProfileData(prev => ({ ...prev, district: e.target.value }))}
                      className="w-full p-3 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:border-indigo-400 focus:outline-none"
                      placeholder="School district"
                      maxLength={40}
                    />
                  </div>
                </div>
                {profileError && (
                  <div className="mt-3 text-red-400 text-sm">{profileError}</div>
                )}
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={handleProfileSubmit}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl border border-indigo-500 transition-all hover:scale-105"
                  >
                    Save & View Leaderboard
                  </button>
                  <button
                    onClick={() => setShowProfile(false)}
                    className="px-6 py-3 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-xl border border-slate-600/50 transition-all"
                  >
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
                  {['All', '9', '10', '11', '12'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setLeaderboardTab(tab)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                        leaderboardTab === tab
                          ? 'bg-indigo-600 text-white border border-indigo-500'
                          : 'bg-slate-700/50 text-slate-300 border border-slate-600/50 hover:bg-slate-600/50'
                      }`}
                    >
                      {tab === 'All' ? 'All Grades' : `${tab}th Grade`}
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
                          <tr 
                            key={`${entry.displayName}-${entry.createdAt}`} 
                            className={`border-b border-slate-800/50 ${
                              isCurrentUser ? 'bg-indigo-500/10' : ''
                            }`}
                          >
                            <td className="py-3 text-slate-300">{index + 1}</td>
                            <td className="py-3">
                              <span className={`font-medium ${
                                isCurrentUser ? 'text-indigo-300' : 'text-slate-200'
                              }`}>
                                {entry.displayName}
                                {isCurrentUser && ' (You)'}
                              </span>
                            </td>
                            <td className="py-3 text-slate-300">{entry.grade}th</td>
                            <td className="py-3 text-slate-400">{entry.district || '—'}</td>
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
                <p className="text-slate-400">
                  We&apos;re working on connecting to our leaderboard service. Your results are saved locally!
                </p>
                {state.result && (
                  <div className="mt-4 inline-flex items-center gap-4 px-6 py-3 bg-slate-800/50 rounded-xl">
                    <span className="text-slate-300">Your Score:</span>
                    <span className="text-indigo-400 font-semibold">{state.result.score}/10 ({state.result.percent}%)</span>
                    <span className="text-slate-400">in {formatTime(state.result.elapsedSeconds)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Return Tomorrow */}
            <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6 text-center">
              <h3 className="text-xl font-semibold text-white mb-2">See You Tomorrow!</h3>
              <p className="text-slate-400">
                Come back tomorrow for a new set of 10 questions. Each day features a unique deterministic mix 
                of Math and English problems that&apos;s the same for all students worldwide.
              </p>
              <p className="text-slate-500 text-sm mt-2">
                Quiz resets daily at midnight UTC
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}