import { NextRequest, NextResponse } from 'next/server';
import { groq, safeJSON } from '@/lib/groq-api';

export async function POST(req: NextRequest) {
  try {
    const { type, items, projectName, techStack } = await req.json();
    if (!items || !Array.isArray(items)) return NextResponse.json({ error: 'Items must be an array' }, { status: 400 });

    const actionVerbs = ['Spearheaded', 'Optimized', 'Architected', 'Engineered', 'Orchestrated'];
    
    // Simulate an AI generation locally
    const enhanced = items.map((item, i) => {
      const verb = actionVerbs[i % actionVerbs.length];
      const context = projectName ? ` for ${projectName}` : '';
      const tech = techStack ? ` utilizing ${techStack}` : '';
      return `${verb} execution${context}${tech}, achieving high-impact results: ${item}`;
    });

    return NextResponse.json({ enhanced });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
