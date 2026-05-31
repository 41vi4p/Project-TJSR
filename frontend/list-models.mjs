import { readFileSync } from 'fs';
const env = readFileSync('.env.local', 'utf-8');
const key = env.split('\n').find(l => l.startsWith('GROQ_API_KEY='))?.split('=')[1]?.trim();

const res = await fetch('https://api.groq.com/openai/v1/models', {
  headers: { Authorization: `Bearer ${key}` }
});
const d = await res.json();
const models = (d.data || []).map(m => m.id).sort();
console.log('All models:\n' + models.join('\n'));
