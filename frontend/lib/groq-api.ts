// Groq helper for AI features
export async function groq(
  messages: { role: 'system' | 'user'; content: string }[],
  model = 'llama-3.3-70b-versatile',
  maxTokens = 4000,
) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set in environment variables');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.1, max_tokens: maxTokens }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? '') as string;
}

// Safely parse JSON — strips markdown fences, finds first complete {...} block
export function safeJSON<T>(raw: string, fallback: T): T {
  try {
    // Remove markdown fences
    let cleaned = raw
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/```\s*$/im, '')
      .trim();
    
    // Find first {...} block
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      cleaned = cleaned.slice(start, end + 1);
    }
    
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('[safeJSON] Failed to parse:', raw.slice(0, 300));
    return fallback;
  }
}
