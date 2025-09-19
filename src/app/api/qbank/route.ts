import { NextRequest, NextResponse } from 'next/server';
import { loadEnglishRaw } from '@/lib/english';
import { loadMathRaw } from '@/lib/math';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subjects = searchParams.get('subjects')?.split(',') || ['english', 'math'];

    const allRows: any[] = [];

    // Load English questions if requested
    if (subjects.includes('english')) {
      try {
        const englishRows = await loadEnglishRaw();
        const englishWithSource = englishRows.map(row => ({
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
        const mathWithSource = mathRows.map(row => ({
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