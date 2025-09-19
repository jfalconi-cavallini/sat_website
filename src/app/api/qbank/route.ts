import { NextRequest, NextResponse } from 'next/server';
import { loadEnglishRaw } from '@/lib/english';
import { loadMathRaw } from '@/lib/math';

// Define types to match your actual data structure
type BaseQuestion = {
  id: string;
  __source?: string;
  domain_desc?: string;
  skill_desc?: string;
  stem_html?: string;
  stimulus_html?: string;
  stem?: string;
  stimulus?: string;
  correct_letters?: string | string[];
  answer?: string;
  difficulty?: string;
  type?: string;
  media?: unknown;
  rationale_html?: string;
  rationale?: string;
};

type MathRow = BaseQuestion & {
  choices?: { key: string; text?: string; correct?: boolean }[];
};

type EnglishRow = BaseQuestion & {
  choices?: { key: string; text: string; correct?: boolean }[];
};

type Question = BaseQuestion & {
  choices?: { key: string; text: string; correct?: boolean }[];
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subjects = searchParams.get('subjects')?.split(',') || ['english', 'math'];

    const allRows: Question[] = [];

    // Load English questions if requested
    if (subjects.includes('english')) {
      try {
        const englishRows = await loadEnglishRaw() as EnglishRow[];
        const englishWithSource: Question[] = englishRows.map((row: EnglishRow) => ({
          ...row,
          __source: 'English',
          // Ensure choices have required text field
          choices: row.choices?.map(choice => ({
            ...choice,
            text: choice.text || choice.key || '' // Fallback to key or empty string
          }))
        }));
        allRows.push(...englishWithSource);
      } catch (error) {
        console.warn('Failed to load English questions:', error);
      }
    }

    // Load Math questions if requested
    if (subjects.includes('math')) {
      try {
        const mathRows = await loadMathRaw() as MathRow[];
        const mathWithSource: Question[] = mathRows.map((row: MathRow) => ({
          ...row,
          __source: 'Math',
          // Ensure choices have required text field
          choices: row.choices?.map(choice => ({
            ...choice,
            text: choice.text || choice.key || '' // Fallback to key or empty string
          }))
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