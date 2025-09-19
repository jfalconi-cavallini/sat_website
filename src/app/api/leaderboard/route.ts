import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';

// SECURITY WARNING: In-memory storage is NOT production ready
// For production, use: PostgreSQL, MongoDB, or Redis with proper persistence
// This resets on every server restart and doesn't scale across multiple instances
const leaderboardData: Record<string, LeaderboardEntry[]> = {};

// Rate limiting storage (in production, use Redis or database)
const rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();

type LeaderboardEntry = {
  displayName: string;
  grade: "9" | "10" | "11" | "12" | "Other";
  district?: string;
  score: number;
  percent: number;
  elapsedSeconds: number;
  createdAt: string;
};

// Security: Rate limiting configuration
const RATE_LIMIT = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // Max 5 submissions per 15 minutes per IP
};

// Security: Enhanced input validation
function sanitizeString(input: string, maxLength: number): string {
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/['"]/g, '') // Remove quotes to prevent injection
    .replace(/\s+/g, ' '); // Normalize whitespace
}

function validateDisplayName(name: string): string | null {
  const sanitized = sanitizeString(name, 20);
  if (sanitized.length < 2) {
    return "Name must be at least 2 characters";
  }
  if (!/^[a-zA-Z0-9\s]+$/.test(sanitized)) {
    return "Only letters, numbers, and spaces allowed";
  }
  
  // Enhanced profanity/abuse detection (add more as needed)
  const blockedWords = [
    'admin', 'test', 'null', 'undefined', 'script', 'alert',
    // Add actual profanity list here
  ];
  const lowerName = sanitized.toLowerCase();
  if (blockedWords.some(word => lowerName.includes(word))) {
    return "Please choose a different name";
  }
  return null;
}

function validateGrade(grade: string): grade is "9" | "10" | "11" | "12" | "Other" {
  return ["9", "10", "11", "12", "Other"].includes(grade);
}

function validateDate(dateStr: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) return false;
  
  const date = new Date(dateStr + 'T00:00:00.000Z');
  if (!(date instanceof Date) || isNaN(date.getTime())) return false;
  
  // Security: Only allow dates within reasonable range (last year to next day)
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  
  return date >= oneYearAgo && date <= tomorrow;
}

function getClientIP(request: NextRequest): string {
  const headersList = headers();
  // Check various headers for real IP (common in production deployments)
  return (
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    headersList.get('cf-connecting-ip') || // Cloudflare
    request.ip ||
    'unknown'
  );
}

function checkRateLimit(ip: string): { allowed: boolean; resetTime?: number } {
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  
  if (!record || now > record.resetTime) {
    // Reset or create new record
    rateLimitStore.set(ip, {
      count: 1,
      resetTime: now + RATE_LIMIT.windowMs
    });
    return { allowed: true };
  }
  
  if (record.count >= RATE_LIMIT.maxRequests) {
    return { allowed: false, resetTime: record.resetTime };
  }
  
  record.count++;
  return { allowed: true };
}

export async function POST(request: NextRequest) {
  try {
    // Security: Rate limiting
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(clientIP);
    
    if (!rateLimitResult.allowed) {
      const resetInMinutes = Math.ceil(((rateLimitResult.resetTime || 0) - Date.now()) / 60000);
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          message: `Too many submissions. Try again in ${resetInMinutes} minutes.`,
          retryAfter: resetInMinutes * 60 // seconds
        },
        { 
          status: 429,
          headers: {
            'Retry-After': String(resetInMinutes * 60),
            'X-RateLimit-Limit': String(RATE_LIMIT.maxRequests),
            'X-RateLimit-Remaining': '0',
          }
        }
      );
    }

    // Security: Validate request body exists and is reasonable size
    let body;
    try {
      const text = await request.text();
      if (text.length > 1024) { // Reasonable max size for leaderboard entry
        return NextResponse.json(
          { error: 'Request payload too large' },
          { status: 413 }
        );
      }
      body = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }
    
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

    // Validate required fields with type checking
    if (typeof date !== 'string' || 
        typeof displayName !== 'string' || 
        typeof grade !== 'string' || 
        typeof score !== 'number' || 
        typeof percent !== 'number' || 
        typeof elapsedSeconds !== 'number') {
      return NextResponse.json(
        { error: 'Invalid field types in request' },
        { status: 400 }
      );
    }

    // Validate date format and range
    if (!validateDate(date)) {
      return NextResponse.json(
        { error: 'Invalid date format or date out of range' },
        { status: 400 }
      );
    }

    // Validate and sanitize display name
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

    // Validate score and percent ranges with stricter bounds
    if (!Number.isInteger(score) || score < 0 || score > 10) {
      return NextResponse.json(
        { error: 'Score must be an integer between 0 and 10' },
        { status: 400 }
      );
    }

    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      return NextResponse.json(
        { error: 'Percent must be an integer between 0 and 100' },
        { status: 400 }
      );
    }

    // Validate elapsed seconds (0 to 720 seconds = 12 minutes max)
    if (!Number.isInteger(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > 720) {
      return NextResponse.json(
        { error: 'Invalid elapsed time (must be 0-720 seconds)' },
        { status: 400 }
      );
    }

    // Security: Validate district if provided
    let sanitizedDistrict: string | undefined;
    if (district) {
      if (typeof district !== 'string') {
        return NextResponse.json(
          { error: 'District must be a string' },
          { status: 400 }
        );
      }
      sanitizedDistrict = sanitizeString(district, 40);
      if (sanitizedDistrict.length === 0) {
        sanitizedDistrict = undefined;
      }
    }

    // Security: Validate createdAt timestamp
    let validatedCreatedAt: string;
    if (createdAt && typeof createdAt === 'string') {
      const timestamp = new Date(createdAt);
      if (isNaN(timestamp.getTime())) {
        validatedCreatedAt = new Date().toISOString();
      } else {
        // Ensure timestamp is within reasonable bounds (not future, not too old)
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        if (timestamp > now || timestamp < oneDayAgo) {
          validatedCreatedAt = new Date().toISOString();
        } else {
          validatedCreatedAt = timestamp.toISOString();
        }
      }
    } else {
      validatedCreatedAt = new Date().toISOString();
    }

    // Create the sanitized entry
    const entry: LeaderboardEntry = {
      displayName: sanitizeString(displayName, 20),
      grade,
      district: sanitizedDistrict,
      score,
      percent,
      elapsedSeconds,
      createdAt: validatedCreatedAt
    };

    // Initialize date array if doesn't exist
    if (!leaderboardData[date]) {
      leaderboardData[date] = [];
    }

    // Security: Prevent duplicate entries and limit entries per date
    const existingIndex = leaderboardData[date].findIndex(
      (existing: LeaderboardEntry) => existing.displayName.toLowerCase() === entry.displayName.toLowerCase()
    );

    // Security: Limit total entries per day to prevent DoS
    const MAX_ENTRIES_PER_DAY = 1000;
    if (leaderboardData[date].length >= MAX_ENTRIES_PER_DAY && existingIndex === -1) {
      return NextResponse.json(
        { error: 'Daily leaderboard is full. Try again tomorrow.' },
        { status: 429 }
      );
    }

    if (existingIndex >= 0) {
      // Update existing entry only if new score is better, or if same score but faster time
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

    return NextResponse.json({ success: true });

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
      
      // Then by elapsed time (lower is better) - for 10/10 ties
      if (a.elapsedSeconds !== b.elapsedSeconds) {
        return a.elapsedSeconds - b.elapsedSeconds;
      }
      
      // Finally by creation time (earlier is better for complete ties)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Return top 20 entries (limit exposure)
    const topEntries = entries.slice(0, 20);

    // Security: Add cache headers to prevent excessive requests
    return NextResponse.json(topEntries, {
      headers: {
        'Cache-Control': 'public, max-age=30, s-maxage=60', // Cache for 30s client, 60s CDN
        'X-Total-Entries': String(entries.length),
      }
    });

  } catch (error) {
    console.error('Error in leaderboard GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}