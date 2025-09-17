"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getProgressStats } from "@/lib/progress";

export type StatusFilter = "All" | "Unanswered" | "Correct" | "Incorrect" | "Flagged";

interface StatusFilterClientProps {
  currentStatus?: string;
  currentDifficulty?: string;
}

export default function StatusFilterClient({ 
  currentStatus, 
  currentDifficulty 
}: StatusFilterClientProps) {
  const [stats, setStats] = useState({
    total: 0,
    answered: 0,
    correct: 0,
    incorrect: 0,
    flagged: 0,
  });

  useEffect(() => {
    // Update stats when component mounts
    setStats(getProgressStats());

    // Listen for progress updates from other components
    const handleStorageChange = () => {
      setStats(getProgressStats());
    };

    window.addEventListener('storage', handleStorageChange);
    // Also listen for custom events from same tab
    window.addEventListener('progressUpdated', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('progressUpdated', handleStorageChange);
    };
  }, []);

  const options: { value: StatusFilter; label: string; count?: number }[] = [
    { value: "All", label: "All Questions" },
    { value: "Unanswered", label: "Not Attempted", count: Math.max(0, stats.total - stats.answered - stats.flagged) },
    { value: "Correct", label: "Correct", count: stats.correct },
    { value: "Incorrect", label: "Incorrect", count: stats.incorrect },
    { value: "Flagged", label: "Flagged", count: stats.flagged },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = (currentStatus || "All") === option.value;
        
        // Build query params
        const query: Record<string, string> = {};
        if (currentDifficulty && currentDifficulty !== "All") {
          query.difficulty = currentDifficulty;
        }
        if (option.value !== "All") {
          query.status = option.value;
        }

        const href = Object.keys(query).length > 0 
          ? `/questions?${new URLSearchParams(query).toString()}`
          : "/questions";

        return (
          <Link
            key={option.value}
            href={href}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
              isSelected
                ? option.value === "Correct"
                  ? "bg-green-600 text-white"
                  : option.value === "Incorrect"
                  ? "bg-red-600 text-white"
                  : option.value === "Flagged"
                  ? "bg-orange-600 text-white"
                  : option.value === "Unanswered"
                  ? "bg-gray-600 text-white"
                  : "bg-slate-700 text-white"
                : "bg-white/10 text-white/70 hover:bg-white/20 border border-white/20"
            }`}
          >
            <span>{option.label}</span>
            {option.count !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                isSelected ? "bg-white/20" : "bg-white/10"
              }`}>
                {option.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}