import { NextResponse } from "next/server";
import { loadEnglishRaw } from "@/lib/english";
import { loadMathRaw } from "@/lib/math";
import { getTodayKey, pickDailyQuestions } from "@/lib/daily-selection";

// GET /api/daily
// Returns today's deterministic 10-question Daily Challenge selection,
// computed server-side. Previously the client fetched the ENTIRE question
// bank (both datasets, including every embedded SVG graph - multiple
// megabytes) via /api/qbank just to run this same seeded selection in the
// browser and throw away everything except 10 questions.
export async function GET() {
  try {
    const [englishRows, mathRows] = await Promise.all([loadEnglishRaw(), loadMathRaw()]);
    const date = getTodayKey();
    const questions = pickDailyQuestions(date, englishRows, mathRows);

    if (questions.length < 10) {
      return NextResponse.json(
        { error: "Not enough questions available to build today's Daily SAT." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { date, questions },
      {
        headers: {
          // The selection is deterministic for the whole UTC day, so this is
          // safe to cache aggressively at the edge.
          "Cache-Control": "public, max-age=300, s-maxage=3600",
        },
      }
    );
  } catch (error) {
    console.error("Error in /api/daily:", error);
    return NextResponse.json({ error: "Failed to load today's Daily SAT" }, { status: 500 });
  }
}
