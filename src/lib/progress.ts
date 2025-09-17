// src/lib/progress.ts
export type QuestionStatus = "unanswered" | "correct" | "incorrect" | "flagged";

export interface QuestionProgress {
  status: QuestionStatus;
  answeredAt: string;
  selectedAnswer?: string;
  timeSpent?: number; // seconds
}

export interface ProgressData {
  [questionId: string]: QuestionProgress;
}

const STORAGE_KEY = "sat-question-progress";

// Client-side only functions
export const getQuestionProgress = (questionId: string): QuestionProgress | null => {
  if (typeof window === "undefined") return null;
  
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    
    const progress: ProgressData = JSON.parse(data);
    return progress[questionId] || null;
  } catch (error) {
    console.error("Error reading progress from localStorage:", error);
    return null;
  }
};

export const saveQuestionProgress = (
  questionId: string,
  status: QuestionStatus,
  selectedAnswer?: string,
  timeSpent?: number
): void => {
  if (typeof window === "undefined") return;
  
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    const progress: ProgressData = data ? JSON.parse(data) : {};
    
    progress[questionId] = {
      status,
      answeredAt: new Date().toISOString(),
      selectedAnswer,
      timeSpent,
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (error) {
    console.error("Error saving progress to localStorage:", error);
  }
};

export const toggleQuestionFlag = (questionId: string): void => {
  if (typeof window === "undefined") return;
  
  const current = getQuestionProgress(questionId);
  const newStatus = current?.status === "flagged" ? "unanswered" : "flagged";
  
  saveQuestionProgress(questionId, newStatus, current?.selectedAnswer, current?.timeSpent);
};

export const getAllProgress = (): ProgressData => {
  if (typeof window === "undefined") return {};
  
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error("Error reading all progress from localStorage:", error);
    return {};
  }
};

export const getProgressStats = (): {
  total: number;
  answered: number;
  correct: number;
  incorrect: number;
  flagged: number;
} => {
  const progress = getAllProgress();
  const entries = Object.values(progress);
  
  return {
    total: entries.length,
    answered: entries.filter(p => p.status === "correct" || p.status === "incorrect").length,
    correct: entries.filter(p => p.status === "correct").length,
    incorrect: entries.filter(p => p.status === "incorrect").length,
    flagged: entries.filter(p => p.status === "flagged").length,
  };
};

export const clearAllProgress = (): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
};

// Hook for React components
export const useQuestionProgress = (questionId: string) => {
  if (typeof window === "undefined") {
    return {
      progress: null,
      saveProgress: () => {},
      toggleFlag: () => {},
    };
  }
  
  return {
    progress: getQuestionProgress(questionId),
    saveProgress: (status: QuestionStatus, selectedAnswer?: string, timeSpent?: number) => {
      saveQuestionProgress(questionId, status, selectedAnswer, timeSpent);
    },
    toggleFlag: () => toggleQuestionFlag(questionId),
  };
};