import { NextRequest, NextResponse } from 'next/server';
import { groq } from '@/lib/groq-api';

export async function POST(req: NextRequest) {
  try {
    const { profile } = await req.json();
    if (!profile) return NextResponse.json({ error: 'Profile data missing' }, { status: 400 });

    const role = profile.headline || 'Software Engineer';
    const skills = profile.flatSkills ? profile.flatSkills.split(',').slice(0, 4).join(', ') : 'modern technologies';
    const experienceText = profile.experience?.length ? `Proven track record of success at organizations including ${profile.experience[0].company || 'top companies'}.` : 'Demonstrated ability to deliver high-quality technical solutions.';
    
    // Simulate an AI generation locally
    const summary = `Results-driven ${role} with expertise in building scalable applications and driving technical innovation. Highly proficient in ${skills}, with a strong focus on clean code and performance optimization. ${experienceText}`;

    return NextResponse.json({ summary: summary.trim() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
