import { NextRequest, NextResponse } from 'next/server';
import { loadEnglishRaw } from '@/lib/english';
import { loadMathRaw } from '@/lib/math';

// Define the question type based on your Question interface
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subjects = searchParams.get('subjects')?.split(',') || ['english', 'math'];

    const allRows: Question[] = [];

    // Load English questions if requested
    if (subjects.includes('english')) {
      try {
        const englishRows = await loadEnglishRaw();
        const englishWithSource = englishRows.map((row: Question) => ({
          ...row,
          __source: 'English'
        }));
        allRows.push(...englishWithSource);
      } catch (error) {
        console.warn('Failed to load English questions:', error);
      }
    }

    // Load Math questions if requested
    if (subjects.includes('math')) {
      try {
        const mathRows = await loadMathRaw();
        const mathWithSource = mathRows.map((row: Question) => ({
          ...row,
          __source: 'Math'
        }));
        allRows.push(...mathWithSource);
      } catch (error) {
        console.warn('Failed to load Math questions:', error);
      }
    }

    // Return the merged array
    return NextResponse.json(allRows);

  } catch (error) {
    console.error('Error in qbank API route:', error);
    return NextResponse.json(
      { error: 'Failed to load question bank' },
      { status: 500 }
    );
  }
}