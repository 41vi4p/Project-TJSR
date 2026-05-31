import { NextRequest, NextResponse } from 'next/server';
import { groq, safeJSON } from '@/lib/groq-api';

const LANGUAGES = ['javascript','python','java','c++','c#','ruby','php','go','rust','typescript','swift','kotlin','r','sql'];
const FRAMEWORKS = ['react','angular','vue','express','django','flask','spring','next.js','svelte','tailwind','bootstrap','nodejs','node.js'];
const TOOLS = ['git','docker','kubernetes','aws','azure','gcp','linux','mongodb','redis','postgresql','mysql','firebase','figma','jira'];

export async function POST(req: NextRequest) {
  try {
    const { skills } = await req.json();
    if (!skills || !Array.isArray(skills)) return NextResponse.json({ error: 'Skills list missing' }, { status: 400 });

    const languages: string[] = [];
    const frameworks: string[] = [];
    const tools: string[] = [];
    const soft: string[] = [];

    skills.forEach(skill => {
      const lower = skill.toLowerCase().trim();
      if (LANGUAGES.some(l => lower.includes(l))) languages.push(skill);
      else if (FRAMEWORKS.some(f => lower.includes(f))) frameworks.push(skill);
      else if (TOOLS.some(t => lower.includes(t))) tools.push(skill);
      else soft.push(skill); // default anything unknown to soft or other
    });

    return NextResponse.json({ languages, frameworks, tools, soft });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
