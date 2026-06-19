import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

export async function POST(req: NextRequest) {
  try {
    const { message, groqApiKey, recentJobs } = await req.json() as {
      message: string;
      groqApiKey: string;
      recentJobs?: { title: string; company: string; location: string; skills: string[] }[];
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }
    if (!groqApiKey?.startsWith('gsk_')) {
      return NextResponse.json(
        { error: 'No Groq API key configured. Go to Settings → API Keys and add your Groq key.' },
        { status: 401 },
      );
    }

    // Build a context snippet from recent jobs so the LLM has something to reference
    const jobContext = recentJobs?.length
      ? `\n\nCurrent job listings in the database (sample):\n` +
        recentJobs.slice(0, 15).map(j =>
          `• ${j.title} @ ${j.company} [${j.location}] — skills: ${(j.skills || []).slice(0, 6).join(', ')}`
        ).join('\n')
      : '';

    const systemPrompt =
      `You are TJSR Job Assistant, a helpful AI for job seekers. You have access to a curated database of job listings. ` +
      `Help users find jobs, understand market trends, compare skills, and get career advice. ` +
      `Be concise and practical. If you don't know something, say so clearly.${jobContext}`;

    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        temperature: 0.4,
        max_tokens: 1024,
        stream: true,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      const parsed = JSON.parse(errText).error?.message ?? errText;
      return NextResponse.json({ error: `Groq error: ${parsed}` }, { status: groqRes.status });
    }

    // Proxy Groq's SSE stream directly to the client
    return new Response(groqRes.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (err) {
    console.error('[/api/chat]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
