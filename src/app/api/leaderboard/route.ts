import { NextRequest, NextResponse } from 'next/server';

// In-memory storage (resets on server restart - for development only)
const leaderboardData: Record<string, any[]> = {};

type LeaderboardEntry = {
  displayName: string;
  grade: "9" | "10" | "11" | "12" | "Other";
  district?: string;
  score: number;
  percent: number;
  elapsedSeconds: number;
  createdAt: string;
};

// Simple validation helpers
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

function validateGrade(grade: string): boolean {
  return ["9", "10", "11", "12", "Other"].includes(grade);
}

function validateDate(dateStr: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) return false;
  
  const date = new Date(dateStr + 'T00:00:00.000Z');
  return date instanceof Date && !isNaN(date.getTime());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      date,
      displayName,
      grade,
      district,
      score,
      percent,
      elapsedSeconds,
      createdAt
    } = body;

    // Validate required fields
    if (!date || !displayName || !grade || typeof score !== 'number' || typeof percent !== 'number' || typeof elapsedSeconds !== 'number') {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate date format
    if (!validateDate(date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    // Validate display name
    const nameError = validateDisplayName(displayName);
    if (nameError) {
      return NextResponse.json(
        { error: nameError },
        { status: 400 }
      );
    }

    // Validate grade
    if (!validateGrade(grade)) {
      return NextResponse.json(
        { error: 'Invalid grade. Must be 9, 10, 11, 12, or Other' },
        { status: 400 }
      );
    }

    // Validate score and percent ranges
    if (score < 0 || score > 10) {
      return NextResponse.json(
        { error: 'Score must be between 0 and 10' },
        { status: 400 }
      );
    }

    if (percent < 0 || percent > 100) {
      return NextResponse.json(
        { error: 'Percent must be between 0 and 100' },
        { status: 400 }
      );
    }

    // Validate elapsed seconds (reasonable range: 0 to 720 seconds = 12 minutes)
    if (elapsedSeconds < 0 || elapsedSeconds > 720) {
      return NextResponse.json(
        { error: 'Invalid elapsed time' },
        { status: 400 }
      );
    }

    // Validate district length if provided
    if (district && district.length > 40) {
      return NextResponse.json(
        { error: 'District name too long (max 40 characters)' },
        { status: 400 }
      );
    }

    // Create the entry
    const entry: LeaderboardEntry = {
      displayName: displayName.trim(),
      grade,
      district: district?.trim(),
      score,
      percent,
      elapsedSeconds,
      createdAt: createdAt || new Date().toISOString()
    };

    // Initialize date array if doesn't exist
    if (!leaderboardData[date]) {
      leaderboardData[date] = [];
    }

    // Check for duplicate entries (same name and date)
    const existingIndex = leaderboardData[date].findIndex(
      (existing: LeaderboardEntry) => existing.displayName === entry.displayName
    );

    if (existingIndex >= 0) {
      // Update existing entry if new score is better, or if same score but faster time
      const existing = leaderboardData[date][existingIndex];
      const shouldUpdate = entry.score > existing.score || 
        (entry.score === existing.score && entry.elapsedSeconds < existing.elapsedSeconds);
      
      if (shouldUpdate) {
        leaderboardData[date][existingIndex] = entry;
      }
    } else {
      // Add new entry
      leaderboardData[date].push(entry);
    }

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('Error in leaderboard POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const grade = searchParams.get('grade');

    // Validate date
    if (!date || !validateDate(date)) {
      return NextResponse.json(
        { error: 'Invalid or missing date parameter. Use YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    // Get entries for the date
    let entries = leaderboardData[date] || [];

    // Filter by grade if specified
    if (grade) {
      if (!validateGrade(grade)) {
        return NextResponse.json(
          { error: 'Invalid grade parameter. Must be 9, 10, 11, 12, or Other' },
          { status: 400 }
        );
      }
      entries = entries.filter((entry: LeaderboardEntry) => entry.grade === grade);
    }

    // Sort entries: score descending, then elapsed time ascending, then created time ascending
    entries.sort((a: LeaderboardEntry, b: LeaderboardEntry) => {
      // First by score (higher is better)
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      
      // Then by elapsed time (lower is better) - this is the key improvement for 10/10 ties
      if (a.elapsedSeconds !== b.elapsedSeconds) {
        return a.elapsedSeconds - b.elapsedSeconds;
      }
      
      // Finally by creation time (earlier is better for complete ties)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Return top 20 entries
    const topEntries = entries.slice(0, 20);

    return NextResponse.json(topEntries);

  } catch (error) {
    console.error('Error in leaderboard GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}