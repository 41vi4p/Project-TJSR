import { NextRequest, NextResponse } from 'next/server';
import { groq, safeJSON } from '@/lib/groq-api';

const ACTION_VERBS = ['Spearheaded', 'Engineered', 'Architected', 'Optimized', 'Accelerated', 'Implemented', 'Transformed'];

export async function POST(req: NextRequest) {
  try {
    const { bullet } = await req.json();
    if (!bullet) return NextResponse.json({ error: 'Bullet text missing' }, { status: 400 });

    const trimmed = bullet.trim();
    // Simulate an AI improvement locally
    const options = [
      `Engineered and deployed scalable solutions: ${trimmed}`,
      `Optimized performance and delivered results: ${trimmed}`,
      `Spearheaded the development of targeted components, resulting in: ${trimmed}`
    ];

    return NextResponse.json({ improved: options });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
