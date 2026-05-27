'use client';

import { useState, useRef, useEffect } from 'react';
import {
  FileText, Upload, TrendingUp, CheckCircle2, AlertCircle,
  BarChart3, Sparkles, Plus, X, Download, Loader2,
  ClipboardPaste, RefreshCw, Trophy, Zap, Tags, XCircle,
  Wand2, Save, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// ─── Types ────────────────────────────────────────────────────────────────────
type ActiveTab = 'score' | 'build' | 'ats' | 'generate';

interface SkillGroup { category: string; skills: string }
interface EduRow { degree: string; institution: string; year: string; cgpa: string; field: string }
interface ExpRow { title: string; company: string; startDate: string; endDate: string; current: boolean; description: string }
interface ProjRow { name: string; url: string; techStack: string; description: string }
interface CertRow { title: string; url: string }

interface ResumeForm {
  name: string; phone: string; email: string; headline: string; location: string;
  github: string; linkedin: string; portfolio: string;
  bio: string;
  flatSkills: string;
  skillGroups: SkillGroup[];
  education: EduRow[];
  experience: ExpRow[];
  projects: ProjRow[];
  certifications: CertRow[];
  achievements: string[];
}

interface ATSResult {
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  feedback: string;
}

interface SectionScore { name: string; present: boolean }
interface ScoreResult {
  score: number;
  strengths: string[];
  improvements: string[];
  sectionScores: SectionScore[];
  quantification: string;   // 'Good' | 'Moderate' | 'Low'
  actionVerbs: string;      // 'Strong' | 'Moderate' | 'Weak'
  wordCount: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const EMPTY_FORM: ResumeForm = {
  name: '', phone: '', email: '', headline: '', location: '',
  github: '', linkedin: '', portfolio: '',
  bio: '',
  flatSkills: '',
  skillGroups: [],
  education: [{ degree: '', institution: '', year: '', cgpa: '', field: '' }],
  experience: [],
  projects: [],
  certifications: [{ title: '', url: '' }],
  achievements: [''],
};

const LS_KEY = 'resume-builder-form-v1';

// ─── NLP Engine ───────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
  'i', 'we', 'you', 'he', 'she', 'it', 'they', 'my', 'our', 'your', 'his', 'her', 'its', 'their',
  'as', 'if', 'then', 'than', 'when', 'where', 'how', 'what', 'which', 'who', 'not', 'no', 'nor',
  'so', 'yet', 'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
  'other', 'some', 'such', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'out', 'off', 'over', 'under', 'again', 'further', 'there', 'here', 'about', 'up', 'down',
  'am', 'get', 'set', 'use', 'also', 'just', 'like', 'make', 'take', 'come', 'go', 'new', 'one',
  'two', 'three', 'time', 'year', 'work', 'team', 'using', 'used', 'include', 'including',
  'experience', 'knowledge', 'skills', 'skill', 'able', 'well', 'strong', 'good', 'great',
]);

const ACTION_VERBS = [
  'achieved', 'implemented', 'developed', 'designed', 'built', 'created', 'optimized',
  'improved', 'led', 'managed', 'delivered', 'launched', 'reduced', 'increased', 'generated',
  'established', 'coordinated', 'automated', 'engineered', 'deployed', 'maintained',
  'collaborated', 'streamlined', 'spearheaded', 'architected', 'integrated', 'analyzed',
  'resolved', 'configured', 'debugged', 'mentored', 'trained', 'scaled', 'accelerated',
  'executed', 'facilitated', 'transformed', 'pioneered', 'authored', 'orchestrated',
];

// Context-aware verb selection (NLP heuristic)
const CONTEXT_VERB_MAP: [RegExp, string][] = [
  [/automat|script|bot|workflow/, 'Automated'],
  [/design|architect|structur|layout/, 'Designed'],
  [/test|debug|fix|bug|issue|resolv/, 'Debugged'],
  [/deploy|releas|launch|ship|publish/, 'Deployed'],
  [/analyz|data|metric|report|insight/, 'Analyzed'],
  [/reduc|decreas|lower|minimiz|cut/, 'Reduced'],
  [/increas|grow|boost|scale|expand/, 'Scaled'],
  [/lead|manag|oversee|direct|head/, 'Led'],
  [/collaborat|team|partner|coordin/, 'Collaborated'],
  [/optim|improv|enhanc|refactor|speed/, 'Optimized'],
  [/build|develop|creat|implement|code/, 'Developed'],
];

function getContextVerb(text: string): string {
  const lower = text.toLowerCase();
  for (const [re, verb] of CONTEXT_VERB_MAP) {
    if (re.test(lower)) return verb;
  }
  const fallbacks = ['Implemented', 'Developed', 'Engineered', 'Built', 'Established'];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

const SKILL_TAXONOMY: Record<string, string[]> = {
  'Programming Languages': [
    'python', 'javascript', 'typescript', 'java', 'c++', 'c#', 'go', 'rust', 'ruby', 'php',
    'swift', 'kotlin', 'r', 'matlab', 'scala', 'dart', 'bash', 'perl', 'c', 'sql', 'lua',
  ],
  'Frameworks & Libraries': [
    'react', 'next.js', 'nextjs', 'vue', 'angular', 'node.js', 'nodejs', 'express', 'django',
    'flask', 'spring', 'rails', 'laravel', 'fastapi', 'tensorflow', 'pytorch', 'keras',
    'scikit-learn', 'pandas', 'numpy', 'tailwind', 'bootstrap', 'redux', 'graphql', 'prisma',
    'socket.io', 'electron', 'flutter', 'svelte', 'remix',
  ],
  'Tools & Cloud': [
    'git', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'linux', 'nginx', 'mongodb',
    'postgresql', 'mysql', 'redis', 'firebase', 'supabase', 'figma', 'jira', 'jenkins',
    'terraform', 'ansible', 'prometheus', 'grafana', 'elasticsearch', 'kafka', 'vercel',
    'netlify', 'heroku', 'cloudflare', 'postman', 'github', 'gitlab',
  ],
  'Security': [
    'penetration testing', 'nmap', 'metasploit', 'burp suite', 'wireshark', 'kali',
    'owasp', 'ctf', 'cryptography', 'network security', 'cybersecurity', 'siem',
    'vulnerability assessment', 'ethical hacking', 'tryhackme', 'hackthebox', 'oscp',
  ],
  'Soft Skills': [
    'leadership', 'communication', 'teamwork', 'problem solving', 'agile', 'scrum',
    'mentoring', 'presentation', 'critical thinking', 'time management', 'collaboration',
    'adaptability', 'project management',
  ],
};

// Tokenizer: lowercase, remove punctuation, filter stop words
function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s.#+/]/g, ' ').split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

// TF scoring map (normalised by max freq)
function tfMap(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  tokens.forEach(t => freq.set(t, (freq.get(t) || 0) + 1));
  const maxF = Math.max(...freq.values(), 1);
  return new Map([...freq.entries()].map(([k, v]) => [k, v / maxF]));
}

// Bigram extraction for multi-word term matching
function bigrams(text: string): string[] {
  const toks = tokenize(text);
  const bg: string[] = [];
  for (let i = 0; i < toks.length - 1; i++) bg.push(`${toks[i]} ${toks[i + 1]}`);
  return [...new Set(bg)];
}

// Multi-word technical phrase patterns for JD analysis
const PHRASE_PATTERNS = [
  /machine learning/g, /deep learning/g, /natural language processing/g,
  /computer vision/g, /data science/g, /cloud computing/g,
  /full[- ]?stack/g, /front[- ]?end/g, /back[- ]?end/g,
  /ci\/cd/g, /rest api/g, /restful api/g,
  /test[- ]?driven/g, /object[- ]?oriented/g, /agile methodology/g,
  /version control/g, /data structures/g, /microservices/g,
  /system design/g, /penetration testing/g, /network security/g,
];

function extractPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  PHRASE_PATTERNS.forEach(p => { const m = lower.match(p); if (m) found.push(...m); });
  return [...new Set(found)];
}

// Flatten the build form into a single text blob for matching
function formToText(form: ResumeForm): string {
  return [
    form.name, form.headline, form.bio, form.flatSkills,
    ...form.skillGroups.map(g => `${g.category} ${g.skills}`),
    ...form.education.map(e => `${e.degree} ${e.institution} ${e.field}`),
    ...form.experience.map(e => `${e.title} ${e.company} ${e.description}`),
    ...form.projects.map(p => `${p.name} ${p.techStack} ${p.description}`),
    ...form.certifications.map(c => c.title),
    ...form.achievements,
  ].join(' ');
}

// ── ATS scoring using TF-weighted unigrams + bigrams + phrase patterns ──────
function runATS(form: ResumeForm, jd: string): ATSResult {
  const resumeText = formToText(form).toLowerCase();
  const jdToks = tokenize(jd);
  const tf = tfMap(jdToks);

  // Top unigrams by TF score
  const topUnigrams = [...tf.entries()]
    .filter(([t]) => t.length > 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([t]) => t);

  // Relevant bigrams (both parts non-stop)
  const relevantBigrams = bigrams(jd)
    .filter(b => { const [a, c] = b.split(' '); return !STOP_WORDS.has(a) && !STOP_WORDS.has(c); })
    .slice(0, 12);

  const phrases = extractPhrases(jd);
  const allTerms = [...new Set([...topUnigrams, ...relevantBigrams, ...phrases])];

  // Weighted matching: phrases/bigrams count double
  let weightedMatch = 0, weightedTotal = 0;
  const matched: string[] = [];
  const missing: string[] = [];

  allTerms.forEach(term => {
    const w = term.includes(' ') ? 2 : 1;
    weightedTotal += w;
    if (resumeText.includes(term)) { weightedMatch += w; matched.push(term); }
    else missing.push(term);
  });

  const score = Math.min(100, Math.round((weightedMatch / Math.max(weightedTotal, 1)) * 100));

  const feedback =
    score >= 70
      ? `Strong match — your resume aligns with ${matched.length}/${allTerms.length} key requirements. You're well-positioned for this role.`
      : score >= 45
        ? `Moderate match. Adding "${missing.slice(0, 3).join('", "')}" to relevant sections could significantly boost your score.`
        : `Below ATS threshold. Prioritise including: ${missing.slice(0, 5).join(', ')}.`;

  return { score, matchedKeywords: matched.slice(0, 20), missingKeywords: missing.slice(0, 15), feedback };
}

// ── Resume text analyser (for the Score tab) ────────────────────────────────
const SECTION_DEFS: { name: string; keywords: string[] }[] = [
  { name: 'Contact Info', keywords: ['phone', 'email', '@', 'linkedin', 'github', 'portfolio'] },
  { name: 'Summary / Profile', keywords: ['summary', 'objective', 'profile', 'about', 'overview'] },
  { name: 'Education', keywords: ['education', 'degree', 'university', 'college', 'bachelor', 'master', 'b.e', 'b.tech', 'b.sc', 'cgpa', 'gpa'] },
  { name: 'Work Experience', keywords: ['experience', 'employment', 'intern', 'engineer', 'developer', 'analyst', 'manager'] },
  { name: 'Skills', keywords: ['skills', 'technologies', 'technical', 'proficiency', 'tools', 'languages'] },
  { name: 'Projects', keywords: ['project', 'portfolio', 'built', 'developed', 'created', 'implemented'] },
  { name: 'Certifications', keywords: ['certification', 'certificate', 'certified', 'credential', 'course'] },
  { name: 'Achievements', keywords: ['achievement', 'award', 'recognition', 'honor', 'ranked', 'winner', 'prize'] },
];

function analyzeText(text: string): ScoreResult {
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);

  const sectionScores: SectionScore[] = SECTION_DEFS.map(s => ({
    name: s.name,
    present: s.keywords.some(k => lower.includes(k)),
  }));

  const presentCount = sectionScores.filter(s => s.present).length;
  const foundVerbs = ACTION_VERBS.filter(v => lower.includes(v));
  const quantMatches = text.match(/\d+\s*[%+x]?(?:\s*(?:percent|users|clients|projects|months|years|teams?))?/gi) ?? [];

  const wc = words.length;
  const verbScore = Math.min(100, (foundVerbs.length / 7) * 100);
  const quantScore = Math.min(100, (quantMatches.length / 5) * 100);
  const lengthScore = wc >= 300 && wc <= 750 ? 100 : wc < 300 ? (wc / 300) * 100 : Math.max(55, 100 - ((wc - 750) / 200) * 18);

  const score = Math.min(100, Math.round(
    (presentCount / SECTION_DEFS.length) * 35 +
    verbScore * 0.25 +
    quantScore * 0.20 +
    lengthScore * 0.20,
  ));

  const strengths: string[] = [];
  const improvements: string[] = [];

  if (presentCount >= 6) strengths.push('Comprehensive coverage across all key resume sections');
  else if (presentCount >= 4) strengths.push(`${presentCount} of 8 key sections present`);
  if (foundVerbs.length >= 6) strengths.push(`Strong action verbs used: ${foundVerbs.slice(0, 4).join(', ')}…`);
  if (quantMatches.length >= 3) strengths.push('Good use of metrics to quantify achievements');
  if (wc >= 300 && wc <= 750) strengths.push(`Optimal length (${wc} words)`);

  const missingNames = sectionScores.filter(s => !s.present).map(s => s.name);
  if (missingNames.length) improvements.push(`Add missing sections: ${missingNames.slice(0, 3).join(', ')}`);
  if (foundVerbs.length < 5) improvements.push('Use strong action verbs: achieved, implemented, optimised, led');
  if (quantMatches.length < 3) improvements.push('Quantify achievements — add numbers, percentages, or scale');
  if (wc < 300) improvements.push('Expand your resume; aim for at least 350 words');
  if (wc > 800) improvements.push('Trim to under 750 words for better scannability');

  return {
    score: Math.max(0, score),
    strengths,
    improvements,
    sectionScores,
    quantification: quantMatches.length >= 4 ? 'Good' : quantMatches.length >= 2 ? 'Moderate' : 'Low',
    actionVerbs: foundVerbs.length >= 7 ? 'Strong' : foundVerbs.length >= 4 ? 'Moderate' : 'Weak',
    wordCount: wc,
  };
}

// ── Skill auto-categorise ────────────────────────────────────────────────────
function autoCategorize(flatSkills: string, existing: SkillGroup[]): SkillGroup[] {
  const all = [
    ...flatSkills.split(',').map(s => s.trim()).filter(Boolean),
    ...existing.flatMap(g => g.skills.split(',').map(s => s.trim()).filter(Boolean)),
  ];
  const unique = [...new Set(all)];
  const result: Record<string, string[]> = {};
  const used = new Set<string>();

  for (const [cat, catSkills] of Object.entries(SKILL_TAXONOMY)) {
    const matched = unique.filter(s => {
      const sl = s.toLowerCase();
      return catSkills.some(cs => sl === cs || sl.includes(cs) || cs.includes(sl));
    });
    if (matched.length) { result[cat] = matched; matched.forEach(m => used.add(m)); }
  }
  const other = unique.filter(s => !used.has(s));
  if (other.length) result['Other Tools & Skills'] = other;
  return Object.entries(result).map(([category, skills]) => ({ category, skills: skills.join(', ') }));
}

// ── Generate professional summary from form data ─────────────────────────────
function generateSummary(form: ResumeForm): string {
  const topSkills = form.flatSkills.split(',').slice(0, 3).map(s => s.trim()).filter(Boolean).join(', ')
    || form.skillGroups.flatMap(g => g.skills.split(',').slice(0, 2)).map(s => s.trim()).slice(0, 3).join(', ');
  const edu = form.education[0];
  const exp = form.experience[0];
  const role = form.headline || 'Software Engineer';
  const isSecurity = /security|cyber|hack|soc|pentest/i.test(role);

  let s = '';
  if (edu?.degree) s += `${edu.degree}${edu.institution ? ` from ${edu.institution}` : ''}, `;
  s += `with a solid foundation in ${topSkills || role}. `;
  if (exp?.title) s += `Experienced as ${exp.title}${exp.company ? ` at ${exp.company}` : ''}, `;
  s += isSecurity
    ? 'delivering secure and resilient systems. '
    : 'building scalable, production-grade applications. ';
  s += 'Passionate about continuous learning and creating impactful solutions.';
  return s;
}

// ── Context-aware bullet improvement (STAR format nudge) ─────────────────────
function improveBullets(text: string): string {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const stripped = line.replace(/^[-•*–]\s*/, '');
      const firstWord = stripped.split(/\s+/)[0].toLowerCase().replace(/\W/g, '');
      const hasVerb = ACTION_VERBS.some(v => firstWord.startsWith(v.slice(0, 5)));
      if (!hasVerb) {
        const verb = getContextVerb(stripped);
        return `• ${verb} ${stripped.charAt(0).toLowerCase()}${stripped.slice(1)}`;
      }
      return `• ${stripped.charAt(0).toUpperCase()}${stripped.slice(1)}`;
    })
    .join('\n');
}

// ── Resume HTML generation (print-ready) ────────────────────────────────────
function buildResumeHTML(form: ResumeForm): string {
  const skills = form.skillGroups.length
    ? form.skillGroups
    : form.flatSkills ? [{ category: 'Skills', skills: form.flatSkills }] : [];

  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const bullets = (text: string) =>
    text.split('\n').filter(b => b.trim())
      .map(b => `<li>${e(b.trim().replace(/^[-•*–]\s*/, ''))}</li>`).join('');

  return `<!DOCTYPE html><html><head>
<meta charset="UTF-8"><title>${e(form.name || 'Resume')}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Georgia',serif;font-size:10.5pt;line-height:1.45;color:#111;padding:.6in .75in;max-width:8.5in;margin:0 auto}
.toolbar{text-align:center;margin:14px 0;padding-bottom:14px;border-bottom:1px solid #ddd}
.toolbar button{padding:9px 30px;background:#5b21b6;color:#fff;border:none;border-radius:7px;font-size:12pt;cursor:pointer;margin-right:8px}
.toolbar button:hover{background:#4c1d95}
@media print{.toolbar{display:none}@page{margin:.45in;size:letter}}
h1{font-size:20pt;font-weight:bold;letter-spacing:.5px;color:#1e0a40;text-transform:uppercase;text-align:center}
.subhead{text-align:center;color:#555;font-size:10.5pt;margin:2px 0}
.contact{text-align:center;font-size:9.5pt;color:#444;margin-top:3px}
.contact a{color:#5b21b6;text-decoration:none}
.sep{margin:0 5px;color:#bbb}
hr.rule{border:none;border-top:2px solid #5b21b6;margin:8px 0 2px}
.sec{font-size:9pt;font-weight:bold;text-transform:uppercase;letter-spacing:1.5px;color:#5b21b6;
     border-bottom:1px solid #ddd;padding-bottom:2px;margin:10px 0 5px}
p.summary{font-size:10.5pt;color:#333;text-align:justify}
.edu-row{display:flex;justify-content:space-between;margin-bottom:5px}
.deg{font-weight:bold;font-size:10.5pt}
.inst{color:#555;font-size:10pt}
.edu-r{text-align:right;font-size:10pt;color:#555}
table.sk{width:100%;border-collapse:collapse}
table.sk td{padding:2px 3px;font-size:10.5pt;vertical-align:top}
table.sk td:first-child{font-weight:600;width:33%;color:#333;white-space:nowrap;padding-right:8px}
.item{margin-bottom:8px}
.ihdr{display:flex;justify-content:space-between;align-items:baseline}
.ititle{font-weight:bold;font-size:10.5pt}
.ico{color:#555;font-size:10pt}
.idate{font-size:9.5pt;color:#666;white-space:nowrap}
.tech{font-size:9.5pt;color:#7c3aed;font-style:italic;margin:1px 0}
ul.bul{padding-left:14px;margin-top:3px}
ul.bul li{font-size:10.5pt;color:#333;margin-bottom:1px}
.certs{display:flex;flex-wrap:wrap;gap:4px 14px}
.certs span{font-size:10.5pt;color:#333}
.certs a{color:#5b21b6;text-decoration:none}
ul.ach{padding-left:14px}
ul.ach li{font-size:10.5pt;color:#333;margin-bottom:2px}
</style></head><body>
<div class="toolbar">
  <button onclick="window.print()">⬇ Download / Print as PDF</button>
  <button onclick="window.close()">✕ Close</button>
</div>
<h1>${e(form.name || 'Your Name')}</h1>
${form.headline ? `<p class="subhead">${e(form.headline)}</p>` : ''}
<p class="contact">
${[form.phone, form.location].filter(Boolean).map(e).join('<span class="sep">|</span>')}
${(form.phone || form.location) && (form.github || form.linkedin || form.portfolio) ? '<br>' : ''}
${[
      form.github && `<a href="https://${e(form.github)}">${e(form.github)}</a>`,
      form.linkedin && `<a href="https://${e(form.linkedin)}">${e(form.linkedin)}</a>`,
      form.portfolio && `<a href="https://${e(form.portfolio)}">${e(form.portfolio)}</a>`,
    ].filter(Boolean).join('<span class="sep">|</span>')}
</p>
<hr class="rule">

${form.bio ? `<div class="sec">Professional Summary</div><p class="summary">${e(form.bio)}</p>` : ''}

${form.education.some(r => r.degree.trim()) ? `
<div class="sec">Education</div>
${form.education.filter(r => r.degree.trim()).map(r => `
<div class="edu-row">
  <div><div class="deg">${e(r.degree)}${r.field ? ` — ${e(r.field)}` : ''}</div>${r.institution ? `<div class="inst">${e(r.institution)}</div>` : ''}</div>
  <div class="edu-r">${r.year ? `<div>${e(r.year)}</div>` : ''} ${r.cgpa ? `<div>${e(r.cgpa)}</div>` : ''}</div>
</div>`).join('')}` : ''}

${skills.some(g => g.skills.trim()) ? `
<div class="sec">Technical Skills</div>
<table class="sk">${skills.filter(g => g.skills.trim()).map(g => `<tr><td>${e(g.category)}</td><td>${e(g.skills)}</td></tr>`).join('')}</table>` : ''}

${form.experience.some(r => r.title.trim()) ? `
<div class="sec">Experience</div>
${form.experience.filter(r => r.title.trim()).map(r => `
<div class="item">
  <div class="ihdr">
    <div><span class="ititle">${e(r.title)}</span>${r.company ? ` — <span class="ico">${e(r.company)}</span>` : ''}</div>
    <div class="idate">${r.startDate ? e(r.startDate) : ''}${r.endDate || r.current ? ` – ${r.current ? 'Present' : e(r.endDate)}` : ''}</div>
  </div>
  ${r.description.trim() ? `<ul class="bul">${bullets(r.description)}</ul>` : ''}
</div>`).join('')}` : ''}

${form.projects.some(r => r.name.trim()) ? `
<div class="sec">Projects</div>
${form.projects.filter(r => r.name.trim()).map(r => `
<div class="item">
  <div class="ihdr">
    <span class="ititle">${e(r.name)}</span>
    ${r.url ? `<span class="idate"><a href="https://${e(r.url)}" style="color:#5b21b6">${e(r.url)}</a></span>` : ''}
  </div>
  ${r.techStack ? `<div class="tech">Stack: ${e(r.techStack)}</div>` : ''}
  ${r.description.trim() ? `<ul class="bul">${bullets(r.description)}</ul>` : ''}
</div>`).join('')}` : ''}

${form.certifications.some(r => r.title.trim()) ? `
<div class="sec">Certifications</div>
<div class="certs">
${form.certifications.filter(r => r.title.trim()).map(r =>
      `<span>${r.url ? `<a href="${e(r.url)}">${e(r.title)}</a>` : e(r.title)}</span>`
    ).join('')}
</div>`: ''}

${form.achievements.some(a => a.trim()) ? `
<div class="sec">Achievements</div>
<ul class="ach">${form.achievements.filter(a => a.trim()).map(a => `<li>${e(a)}</li>`).join('')}</ul>` : ''}

</body></html>`;
}

// ─── Style atoms (matching project dark theme) ────────────────────────────────
const card = 'bg-slate-900/50 border border-purple-500/20 rounded-lg p-6 mb-5';
const inp = 'w-full rounded-lg border border-purple-500/20 bg-slate-800/50 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all';
const ta = 'w-full rounded-lg border border-purple-500/20 bg-slate-800/50 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all resize-none';
const aiBtn = (loading: boolean, label = 'Enhance') =>
  `flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs text-purple-300 hover:bg-purple-500/20 transition-colors disabled:opacity-50 ${loading ? 'opacity-60' : ''}`;

// ─── Score ring SVG ───────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const r = 50, circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 70 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="124" height="124" className="-rotate-90">
        <circle cx="62" cy="62" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
        <circle cx="62" cy="62" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.9s ease' }} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-gray-400">/ 100</span>
      </div>
    </div>
  );
}

// ─── Section card wrapper ─────────────────────────────────────────────────────
function SCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={card}>
      <h2 className="text-sm font-semibold text-white mb-4">{title}</h2>
      {children}
    </div>
  );
}
function Lbl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ResumeAnalyzerPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ActiveTab>('score');

  // Load profile from Firestore
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['candidate-profile', user?.uid],
    queryFn: async () => {
      if (!user?.uid) return null;
      const res = await fetch('/api/candidate/profile', {
        headers: { 'x-user-uid': user.uid }
      });
      return res.json();
    },
    enabled: !!user?.uid,
  });

  // Populate form from profile data
  useEffect(() => {
    if (profile && Object.keys(profile).length > 0) {
      setForm(prev => ({
        ...EMPTY_FORM,
        ...profile,
        // Ensure arrays exist
        education: profile.education || EMPTY_FORM.education,
        experience: profile.experience || EMPTY_FORM.experience,
        projects: profile.projects || EMPTY_FORM.projects,
        skillGroups: profile.skillGroups || EMPTY_FORM.skillGroups,
        certifications: profile.certifications || EMPTY_FORM.certifications,
        achievements: profile.achievements || EMPTY_FORM.achievements,
      }));
    }
  }, [profile]);

  // ── Score tab state
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [buildPopulated, setBuildPopulated] = useState(false);

  // ── Build tab state
  const [form, setForm] = useState<ResumeForm>(EMPTY_FORM);
  const [autoCatting, setAutoCatting] = useState(false);
  const [genningSum, setGenningSum] = useState(false);
  const [improvingExp, setImprovingExp] = useState<number | null>(null);
  const [improvingProj, setImprovingProj] = useState<number | null>(null);

  // ── ATS tab state
  const [jd, setJd] = useState('');
  const [atsChecking, setAtsChecking] = useState(false);
  const [atsResult, setAtsResult] = useState<ATSResult | null>(null);

  // ── Generate tab
  const [generating, setGenerating] = useState(false);

  // Persist build form to localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) setForm(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  async function handleSave() {
    if (!user?.uid) { toast.error('Sign in to save your resume'); return; }
    try {
      const res = await fetch('/api/candidate/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-uid': user.uid
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to save to profile');
      toast.success('Resume saved to your account!');
      queryClient.invalidateQueries({ queryKey: ['candidate-profile', user.uid] });
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function upd(patch: Partial<ResumeForm>) {
    setForm(prev => ({ ...prev, ...patch }));
  }

  // ─── Score Tab handlers ─────────────────────────────────────────────────
  async function handleFileUpload(file: File) {
    setUploadedFile(file);
    setAnalyzing(true);
    setScoreResult(null);
    setBuildPopulated(false);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/resume/analyze', { method: 'POST', body: fd });
      const data = await res.json();

      if (!res.ok) {
        // 422 means unreadable PDF → show paste fallback
        if (res.status === 422) { setShowPaste(true); }
        throw new Error(data.error || 'Analysis failed');
      }

      const { text, score, strengths, improvements, sectionScores, quantification, actionVerbs, wordCount, parsedForm } = data as {
        text: string;
        score: number;
        strengths: string[];
        improvements: string[];
        sectionScores: SectionScore[];
        quantification: string;
        actionVerbs: string;
        wordCount: number;
        parsedForm: Partial<ResumeForm>;
      };

      // All values are now from Groq - no static fallback needed
      setScoreResult({
        score: (typeof score === 'number' && !isNaN(score)) ? score : 0,
        strengths: Array.isArray(strengths) ? strengths : [],
        improvements: Array.isArray(improvements) ? improvements : [],
        sectionScores: Array.isArray(sectionScores) ? sectionScores : [],
        quantification: quantification || 'Low',
        actionVerbs: actionVerbs || 'Weak',
        wordCount: wordCount || 0,
      });

      // ── Build Section Auto-populate disabled by user request ──────
      // The user explicitly requested to NOT auto-populate the Build section
      // when a resume is uploaded on the Score tab.
      toast.success('Analysis complete! (Build auto-import is disabled)');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleAnalyzePaste() {
    if (!pastedText.trim()) { toast.error('Paste your resume text first'); return; }
    setAnalyzing(true);
    setScoreResult(null);
    try {
      const res = await fetch('/api/resume/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pastedText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setScoreResult({
        score: data.score ?? 0,
        strengths: data.strengths ?? [],
        improvements: data.improvements ?? [],
        sectionScores: data.sectionScores ?? [],
        quantification: data.quantification ?? 'Low',
        actionVerbs: data.actionVerbs ?? 'Weak',
        wordCount: data.wordCount ?? 0,
      });
      toast.success('Analysis complete!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  // ─── Build Tab handlers ─────────────────────────────────────────────────
  async function handleAutoCat() {
    const skills = [...form.flatSkills.split(',').map(s => s.trim()).filter(Boolean),
    ...form.skillGroups.flatMap(g => g.skills.split(',').map(s => s.trim()).filter(Boolean))];
    if (!skills.length) { toast.error('Add skills to the field above first'); return; }

    setAutoCatting(true);
    try {
      const res = await fetch('/api/candidate/categorize-skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const newGroups: SkillGroup[] = [
        { category: 'Programming Languages', skills: data.languages?.join(', ') || '' },
        { category: 'Frameworks & Libraries', skills: data.frameworks?.join(', ') || '' },
        { category: 'Tools & Cloud', skills: data.tools?.join(', ') || '' },
        { category: 'Soft Skills', skills: data.soft?.join(', ') || '' },
      ].filter(g => g.skills);

      upd({ skillGroups: newGroups });
      toast.success('Skills auto-categorized with AI!');
    } catch (err: any) {
      toast.error('Categorization failed: ' + err.message);
    } finally {
      setAutoCatting(false);
    }
  }

  async function handleGenSummary() {
    setGenningSum(true);
    try {
      const res = await fetch('/api/candidate/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      upd({ bio: data.summary });
      toast.success('Professional summary generated!');
    } catch (err: any) {
      toast.error('Summary generation failed');
    } finally {
      setGenningSum(false);
    }
  }

  async function handleImproveExp(idx: number) {
    const desc = form.experience[idx]?.description;
    if (!desc?.trim()) { toast.error('Add a description first'); return; }
    setImprovingExp(idx);
    try {
      const res = await fetch('/api/candidate/improve-bullet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bullet: desc, targetRole: form.headline }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const ex = [...form.experience];
      ex[idx] = { ...ex[idx], description: data.improved[0] }; // Use first AI suggestion
      upd({ experience: ex });
      toast.success('Bullet improved with STAR method!');
    } catch (err: any) {
      toast.error('Improvement failed');
    } finally {
      setImprovingExp(null);
    }
  }

  async function handleImproveProj(idx: number) {
    const proj = form.projects[idx];
    if (!proj?.description?.trim()) { toast.error('Add a description first'); return; }
    setImprovingProj(idx);
    try {
      const res = await fetch('/api/candidate/enhance-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'project',
          items: proj.description.split('\n').filter(Boolean),
          projectName: proj.name,
          techStack: proj.techStack
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const pr = [...form.projects];
      pr[idx] = { ...pr[idx], description: data.enhanced.join('\n') };
      upd({ projects: pr });
      toast.success('Project bullets enhanced!');
    } catch (err: any) {
      toast.error('Enhancement failed');
    } finally {
      setImprovingProj(null);
    }
  }

  // ─── ATS Tab ────────────────────────────────────────────────────────────
  async function handleATS() {
    if (!jd.trim()) { toast.error('Paste a job description first'); return; }
    setAtsChecking(true);
    try {
      const res = await fetch('/api/candidate/ats-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: form, jobDescription: jd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAtsResult(data);
      toast.success('ATS Analysis complete!');
    } catch (err: any) {
      toast.error('ATS Check failed: ' + err.message);
    } finally {
      setAtsChecking(false);
    }
  }

  // ─── Generate Tab ────────────────────────────────────────────────────────
  async function handleDownloadResume() {
    const resumeText = formToText(form);
    if (resumeText.trim().length < 30) { toast.error('Fill in the Build tab first'); return; }
    setGenerating(true);
    try {
      const res = await fetch('/api/candidate/export-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Open the print-ready HTML page in a new tab
      // User clicks the purple button inside to Print → Save as PDF
      const win = window.open('', '_blank');
      if (win) {
        win.document.open();
        win.document.write(data.html);
        win.document.close();
        toast.success('Resume opened — click the purple button to download as PDF');
      } else {
        toast.error('Allow pop-ups for this site, then try again');
      }
    } catch (err: any) {
      toast.error('Resume generation failed: ' + err.message);
    } finally {
      setGenerating(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'score', label: 'Overall Score', icon: <TrendingUp size={16} /> },
    { id: 'build', label: 'Build', icon: <FileText size={16} /> },
    { id: 'ats', label: 'ATS Check', icon: <BarChart3 size={16} /> },
    { id: 'generate', label: 'Generate', icon: <Download size={16} /> },
  ];

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-1">Resume Analyzer</h1>
        <p className="text-gray-400 text-sm">Score · Build · ATS-optimise · Generate your resume using NLP</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-900/60 border border-purple-500/20 rounded-xl p-1 mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-all ${tab === t.id
              ? 'bg-gradient-to-r from-purple-600 to-blue-500 text-white shadow-lg'
              : 'text-gray-400 hover:text-white'
              }`}>
            {t.icon} <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ══════════════════════ SCORE TAB ══════════════════════ */}
      {tab === 'score' && (
        <>
          {/* Upload */}
          <div className={card}>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={18} className="text-purple-400" />
              <h2 className="font-semibold text-white">Overall Resume Score</h2>
            </div>
            <p className="text-xs text-gray-400 mb-5">
              Upload your PDF / TXT resume or paste the text below. Our NLP engine checks sections, action verbs, quantification and length.
            </p>

            {/* Drag-drop zone */}
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={ev => ev.preventDefault()}
              onDrop={ev => { ev.preventDefault(); const f = ev.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
              className="flex flex-col items-center justify-center border-2 border-dashed border-purple-500/30 rounded-lg py-10 cursor-pointer hover:border-purple-500/60 transition-colors mb-4 bg-slate-800/20">
              <Upload size={32} className="text-purple-400 mb-2" />
              <p className="text-white font-medium text-sm">
                {uploadedFile ? uploadedFile.name : 'Drag & drop or click to upload'}
              </p>
              <p className="text-gray-500 text-xs mt-1">PDF or TXT up to 5 MB</p>
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.txt" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />

            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => handleFileUpload(uploadedFile!)} disabled={!uploadedFile || analyzing}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-500 rounded-lg text-white text-sm font-semibold hover:shadow-lg glow-purple-hover smooth-transition disabled:opacity-50">
                {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {analyzing ? 'Analysing…' : 'Analyse'}
              </button>
              <button onClick={() => setShowPaste(v => !v)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
                <ClipboardPaste size={14} /> Paste text instead
              </button>
            </div>

            {showPaste && (
              <div className="mt-3">
                <textarea rows={7} value={pastedText} onChange={e => setPastedText(e.target.value)}
                  placeholder="Paste your full resume text here…"
                  className={`${ta} mb-2`} />
                <button onClick={handleAnalyzePaste}
                  className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-purple-600 to-blue-500 rounded-lg text-white text-sm font-semibold hover:shadow-lg glow-purple-hover smooth-transition">
                  <Zap size={14} /> Analyse Text
                </button>
              </div>
            )}
          </div>

          {/* Auto-populate banner */}
          {buildPopulated && (
            <div className="mb-4 flex items-center justify-between rounded-xl border border-green-500/25 bg-green-500/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-green-300">
                <CheckCircle2 size={16} className="shrink-0" />
                <span>Build section auto-populated from your resume.</span>
              </div>
              <button onClick={() => setTab('build')}
                className="ml-4 flex items-center gap-1 rounded-lg border border-green-500/30 bg-green-500/15 px-3 py-1.5 text-xs text-green-300 hover:bg-green-500/25 transition-colors whitespace-nowrap">
                Go to Build <ChevronRight size={12} />
              </button>
            </div>
          )}

          {/* Results */}
          {scoreResult && (
            <>
              {/* Score card */}
              <div className={card}>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <ScoreRing score={scoreResult.score} />
                  <div className="flex-1 text-center sm:text-left">
                    <p className={`text-xl font-bold ${scoreResult.score >= 70 ? 'text-green-400' : scoreResult.score >= 45 ? 'text-amber-400' : 'text-red-400'}`}>
                      {scoreResult.score >= 70 ? 'Strong Resume' : scoreResult.score >= 45 ? 'Moderate — needs polish' : 'Needs significant improvement'}
                    </p>
                    <p className="text-sm text-gray-400 mt-1">{scoreResult.wordCount} words</p>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                      {[
                        { label: 'Sections', val: `${scoreResult.sectionScores.filter(s => s.present).length}/8` },
                        { label: 'Quantification', val: scoreResult.quantification },
                        { label: 'Action Verbs', val: scoreResult.actionVerbs },
                      ].map(m => (
                        <div key={m.label} className="bg-slate-800/50 rounded-lg py-2 px-3">
                          <p className="text-xs text-gray-400">{m.label}</p>
                          <p className={`text-sm font-semibold ${m.val === 'Good' || m.val === 'Strong' ? 'text-green-400' :
                            m.val === 'Moderate' ? 'text-amber-400' : 'text-white'
                            }`}>{m.val}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>


              {/* Tip */}
              <div className="rounded-lg border border-purple-500/20 bg-purple-500/8 p-4 text-xs text-gray-300 mb-5">
                <p className="text-purple-300 font-semibold mb-1 flex items-center gap-1">
                  <Tags size={13} /> Tip — Build & Generate
                </p>
                Use the <strong className="text-white">Build</strong> tab to fill your resume, then <strong className="text-white">ATS Check</strong> it against a job description, and finally <strong className="text-white">Generate</strong> a print-ready PDF.
              </div>
            </>
          )}
        </>
      )}

      {/* ══════════════════════ BUILD TAB ══════════════════════ */}
      {tab === 'build' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-400">Data is saved to your account. Use <strong className="text-white">Generate</strong> tab to export as LaTeX/PDF.</p>
            <button onClick={handleSave}
              className="flex items-center gap-1.5 text-xs text-purple-300 border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 rounded-lg hover:bg-purple-500/20 transition-colors">
              <Save size={13} /> Save to Profile
            </button>
          </div>

          {/* Contact */}
          <SCard title="Contact Information">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Lbl label="Full Name"><input className={inp} value={form.name} placeholder="Arjun Sharma"
                onChange={e => upd({ name: e.target.value })} /></Lbl>
              <Lbl label="Phone"><input className={inp} value={form.phone} placeholder="+91 9876543210"
                onChange={e => upd({ phone: e.target.value })} /></Lbl>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Lbl label="Email"><input className={inp} value={form.email} placeholder="you@example.com"
                onChange={e => upd({ email: e.target.value })} /></Lbl>
              <Lbl label="Location"><input className={inp} value={form.location} placeholder="Mumbai, India"
                onChange={e => upd({ location: e.target.value })} /></Lbl>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Lbl label="Headline / Target Role"><input className={inp} value={form.headline} placeholder="Full-Stack Developer"
                onChange={e => upd({ headline: e.target.value })} /></Lbl>
              <Lbl label="GitHub URL"><input className={inp} value={form.github} placeholder="github.com/username"
                onChange={e => upd({ github: e.target.value })} /></Lbl>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Lbl label="LinkedIn URL"><input className={inp} value={form.linkedin} placeholder="linkedin.com/in/username"
                onChange={e => upd({ linkedin: e.target.value })} /></Lbl>
              <Lbl label="Portfolio / Website"><input className={inp} value={form.portfolio} placeholder="yoursite.com"
                onChange={e => upd({ portfolio: e.target.value })} /></Lbl>
            </div>
          </SCard>

          {/* Summary */}
          <SCard title="Professional Summary">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">3 sentences that sell you.</span>
              <button onClick={handleGenSummary} disabled={genningSum} className={aiBtn(genningSum, 'Generate with NLP')}>
                {genningSum ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {genningSum ? 'Generating…' : 'Enhance'}
              </button>
            </div>
            <textarea className={ta} rows={4} value={form.bio}
              placeholder="Experienced developer with expertise in React and Node.js…"
              onChange={e => upd({ bio: e.target.value })} />
          </SCard>

          {/* Education */}
          <SCard title="Education">
            <p className="text-xs text-gray-500 mb-3">Latest first.</p>
            <div className="space-y-3">
              {form.education.map((edu, i) => (
                <div key={i} className="rounded-lg border border-purple-500/10 bg-slate-800/30 p-4 relative">
                  <button onClick={() => upd({ education: form.education.filter((_, x) => x !== i) })}
                    className="absolute top-3 right-3 text-gray-500 hover:text-white"><X size={14} /></button>
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <Lbl label="Degree"><input className={inp} value={edu.degree} placeholder="B.E. Computer Science"
                      onChange={e => { const ed = [...form.education]; ed[i] = { ...ed[i], degree: e.target.value }; upd({ education: ed }); }} /></Lbl>
                    <Lbl label="Institution"><input className={inp} value={edu.institution} placeholder="University Name"
                      onChange={e => { const ed = [...form.education]; ed[i] = { ...ed[i], institution: e.target.value }; upd({ education: ed }); }} /></Lbl>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Lbl label="Year"><input className={inp} value={edu.year} placeholder="2025"
                      onChange={e => { const ed = [...form.education]; ed[i] = { ...ed[i], year: e.target.value }; upd({ education: ed }); }} /></Lbl>
                    <Lbl label="CGPA / %"><input className={inp} value={edu.cgpa} placeholder="8.5 / 10"
                      onChange={e => { const ed = [...form.education]; ed[i] = { ...ed[i], cgpa: e.target.value }; upd({ education: ed }); }} /></Lbl>
                    <Lbl label="Field / Honours"><input className={inp} value={edu.field} placeholder="Cybersecurity"
                      onChange={e => { const ed = [...form.education]; ed[i] = { ...ed[i], field: e.target.value }; upd({ education: ed }); }} /></Lbl>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => upd({ education: [...form.education, { degree: '', institution: '', year: '', cgpa: '', field: '' }] })}
              className="mt-3 flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300">
              <Plus size={14} /> Add row
            </button>
          </SCard>

          {/* Skills */}
          <SCard title="Technical Skills">
            <Lbl label="All your skills (comma-separated)">
              <textarea className={`${ta} mb-1`} rows={3}
                value={form.flatSkills}
                placeholder="React, Node.js, Python, Docker, AWS, PostgreSQL, Git…"
                onChange={e => upd({ flatSkills: e.target.value })} />
            </Lbl>
            <div className="flex items-center justify-between mt-2 mb-4">
              <p className="text-xs text-gray-500">NLP taxonomy matching groups skills automatically.</p>
              <button onClick={handleAutoCat} disabled={autoCatting} className={aiBtn(autoCatting, 'Auto-categorise')}>
                {autoCatting ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                {autoCatting ? 'Categorising…' : 'Auto-categorise'}
              </button>
            </div>
            {form.skillGroups.length > 0 && (
              <>
                <p className="text-xs text-gray-400 mb-2">Categorised groups (edit freely)</p>
                <div className="space-y-2">
                  {form.skillGroups.map((g, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input className={inp} style={{ width: '10.5rem', flexShrink: 0 }} value={g.category}
                        placeholder="e.g. Languages"
                        onChange={e => { const sg = [...form.skillGroups]; sg[i] = { ...sg[i], category: e.target.value }; upd({ skillGroups: sg }); }} />
                      <input className={`${inp} flex-1`} value={g.skills} placeholder="Python, JavaScript"
                        onChange={e => { const sg = [...form.skillGroups]; sg[i] = { ...sg[i], skills: e.target.value }; upd({ skillGroups: sg }); }} />
                      <button onClick={() => upd({ skillGroups: form.skillGroups.filter((_, x) => x !== i) })}
                        className="text-gray-500 hover:text-white shrink-0"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <button onClick={() => upd({ skillGroups: [...form.skillGroups, { category: '', skills: '' }] })}
              className="mt-3 flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300">
              <Plus size={14} /> Add category manually
            </button>
          </SCard>

          {/* Experience */}
          <SCard title="Experience">
            <p className="text-xs text-gray-500 mb-3">
              Enter bullets one per line. Click <Sparkles size={11} className="inline text-purple-400" /> to rewrite with action verbs using NLP.
            </p>
            <div className="space-y-4">
              {form.experience.map((exp, i) => (
                <div key={i} className="rounded-lg border border-purple-500/10 bg-slate-800/30 p-4 relative">
                  <button onClick={() => upd({ experience: form.experience.filter((_, x) => x !== i) })}
                    className="absolute top-3 right-3 text-gray-500 hover:text-white"><X size={14} /></button>
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <Lbl label="Job Title"><input className={inp} value={exp.title} placeholder="Software Engineer Intern"
                      onChange={e => { const ex = [...form.experience]; ex[i] = { ...ex[i], title: e.target.value }; upd({ experience: ex }); }} /></Lbl>
                    <Lbl label="Company"><input className={inp} value={exp.company} placeholder="Acme Corp"
                      onChange={e => { const ex = [...form.experience]; ex[i] = { ...ex[i], company: e.target.value }; upd({ experience: ex }); }} /></Lbl>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <Lbl label="Start Date"><input className={inp} value={exp.startDate} placeholder="Jun 2024"
                      onChange={e => { const ex = [...form.experience]; ex[i] = { ...ex[i], startDate: e.target.value }; upd({ experience: ex }); }} /></Lbl>
                    <Lbl label="End Date"><input className={inp} value={exp.endDate} placeholder="Dec 2024" disabled={exp.current}
                      onChange={e => { const ex = [...form.experience]; ex[i] = { ...ex[i], endDate: e.target.value }; upd({ experience: ex }); }} /></Lbl>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-400 mb-2 cursor-pointer">
                    <input type="checkbox" checked={exp.current}
                      onChange={e => { const ex = [...form.experience]; ex[i] = { ...ex[i], current: e.target.checked }; upd({ experience: ex }); }} />
                    Currently working here
                  </label>
                  <Lbl label="Bullet Points (one per line)">
                    <div className="relative">
                      <textarea className={`${ta} pr-24`} rows={4} value={exp.description}
                        placeholder={"Built REST APIs reducing response time by 40%.\nLed migration of legacy codebase to TypeScript."}
                        onChange={e => { const ex = [...form.experience]; ex[i] = { ...ex[i], description: e.target.value }; upd({ experience: ex }); }} />
                      <button onClick={() => handleImproveExp(i)} disabled={improvingExp === i}
                        className="absolute top-2 right-2 flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2 py-1 text-xs text-purple-300 hover:bg-purple-500/20 transition-colors disabled:opacity-50">
                        {improvingExp === i ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} Improve
                      </button>
                    </div>
                  </Lbl>
                </div>
              ))}
            </div>
            <button onClick={() => upd({ experience: [...form.experience, { title: '', company: '', startDate: '', endDate: '', current: false, description: '' }] })}
              className="mt-3 flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300">
              <Plus size={14} /> Add experience
            </button>
          </SCard>

          {/* Projects */}
          <SCard title="Projects">
            <p className="text-xs text-gray-500 mb-3">
              Bullets one per line — click <Sparkles size={11} className="inline text-purple-400" /> to enhance with action verbs.
            </p>
            <div className="space-y-4">
              {form.projects.map((proj, i) => (
                <div key={i} className="rounded-lg border border-purple-500/10 bg-slate-800/30 p-4 relative">
                  <button onClick={() => upd({ projects: form.projects.filter((_, x) => x !== i) })}
                    className="absolute top-3 right-3 text-gray-500 hover:text-white"><X size={14} /></button>
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <Lbl label="Project Name"><input className={inp} value={proj.name} placeholder="Job Tracker App"
                      onChange={e => { const pr = [...form.projects]; pr[i] = { ...pr[i], name: e.target.value }; upd({ projects: pr }); }} /></Lbl>
                    <Lbl label="GitHub / Live URL"><input className={inp} value={proj.url} placeholder="github.com/user/repo"
                      onChange={e => { const pr = [...form.projects]; pr[i] = { ...pr[i], url: e.target.value }; upd({ projects: pr }); }} /></Lbl>
                  </div>
                  <Lbl label="Tech Stack (comma-separated)">
                    <input className={`${inp} mb-2`} value={proj.techStack} placeholder="React, Node.js, MongoDB"
                      onChange={e => { const pr = [...form.projects]; pr[i] = { ...pr[i], techStack: e.target.value }; upd({ projects: pr }); }} />
                  </Lbl>
                  <Lbl label="Bullet Points (one per line)">
                    <div className="relative">
                      <textarea className={`${ta} pr-24`} rows={3} value={proj.description}
                        placeholder={"Built a dashboard tracking 200+ job applications.\nIntegrated AI scoring with 90% accuracy."}
                        onChange={e => { const pr = [...form.projects]; pr[i] = { ...pr[i], description: e.target.value }; upd({ projects: pr }); }} />
                      <button onClick={() => handleImproveProj(i)} disabled={improvingProj === i}
                        className="absolute top-2 right-2 flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2 py-1 text-xs text-purple-300 hover:bg-purple-500/20 transition-colors disabled:opacity-50">
                        {improvingProj === i ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} Enhance
                      </button>
                    </div>
                  </Lbl>
                </div>
              ))}
            </div>
            <button onClick={() => upd({ projects: [...form.projects, { name: '', url: '', techStack: '', description: '' }] })}
              className="mt-3 flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300">
              <Plus size={14} /> Add project
            </button>
          </SCard>

          {/* Certifications */}
          <SCard title="Certifications">
            <div className="space-y-2">
              {form.certifications.map((cert, i) => (
                <div key={i} className="flex gap-2">
                  <input className={`${inp} flex-1`} value={cert.title} placeholder="AWS Certified Solutions Architect"
                    onChange={e => { const c = [...form.certifications]; c[i] = { ...c[i], title: e.target.value }; upd({ certifications: c }); }} />
                  <input className={`${inp} flex-1`} value={cert.url} placeholder="Certificate URL (optional)"
                    onChange={e => { const c = [...form.certifications]; c[i] = { ...c[i], url: e.target.value }; upd({ certifications: c }); }} />
                  <button onClick={() => upd({ certifications: form.certifications.filter((_, x) => x !== i) })}
                    className="text-gray-500 hover:text-white shrink-0"><X size={14} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => upd({ certifications: [...form.certifications, { title: '', url: '' }] })}
              className="mt-3 flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300">
              <Plus size={14} /> Add certification
            </button>
          </SCard>

          {/* Achievements */}
          <SCard title="Achievements">
            <p className="text-xs text-gray-500 mb-3">Rankings, awards, CTF placements, etc.</p>
            <div className="space-y-2">
              {form.achievements.map((ach, i) => (
                <div key={i} className="flex gap-2">
                  <input className={`${inp} flex-1`} value={ach}
                    placeholder="Top 4% on TryHackMe global platform"
                    onChange={e => { const a = [...form.achievements]; a[i] = e.target.value; upd({ achievements: a }); }} />
                  <button onClick={() => upd({ achievements: form.achievements.filter((_, x) => x !== i) })}
                    className="text-gray-500 hover:text-white shrink-0"><X size={14} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => upd({ achievements: [...form.achievements, ''] })}
              className="mt-3 flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300">
              <Plus size={14} /> Add achievement
            </button>
          </SCard>

          {/* Footer CTA */}
          <div className="flex gap-3">
            <button onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-600 to-blue-500 rounded-xl text-sm font-semibold text-white hover:shadow-lg glow-purple-hover smooth-transition">
              <Save size={16} /> Save to Profile
            </button>
            <button onClick={() => setTab('generate')}
              className="flex items-center gap-1.5 px-5 py-3 border border-purple-500/20 rounded-xl text-sm text-purple-300 hover:bg-purple-500/10 smooth-transition">
              Generate <ChevronRight size={14} />
            </button>
          </div>
        </>
      )}

      {/* ══════════════════════ ATS TAB ══════════════════════ */}
      {tab === 'ats' && (
        <div className={card}>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 size={18} className="text-purple-400" />
            <h2 className="font-semibold text-white">ATS Score Checker</h2>
          </div>
          <p className="text-xs text-gray-400 mb-5">
            Paste the job description. The NLP engine uses TF-weighted unigram scoring + bigram matching + multi-word phrase extraction to compute your ATS compatibility against the data in the <strong className="text-white">Build</strong> tab.
          </p>

          <div className="relative mb-4">
            <ClipboardPaste size={15} className="absolute left-3 top-3 text-gray-500 pointer-events-none" />
            <textarea rows={8} value={jd} onChange={e => setJd(e.target.value)}
              placeholder="Paste the full job description here…"
              className="w-full rounded-lg border border-purple-500/20 bg-slate-800/50 pl-10 pr-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all resize-none" />
          </div>

          <div className="flex gap-3">
            <button onClick={handleATS} disabled={atsChecking || !jd.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-500 rounded-lg text-white text-sm font-semibold hover:shadow-lg glow-purple-hover smooth-transition disabled:opacity-50">
              {atsChecking ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {atsChecking ? 'Analysing…' : 'Check ATS Score'}
            </button>
            {atsResult && (
              <button onClick={() => { setAtsResult(null); setJd(''); }}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
                <RefreshCw size={14} /> Reset
              </button>
            )}
          </div>

          {atsResult && (
            <div className="mt-6 space-y-5">
              {/* Score summary */}
              <div className="flex flex-col sm:flex-row items-center gap-6 bg-slate-800/30 rounded-xl p-5 border border-purple-500/10">
                <ScoreRing score={atsResult.score} />
                <div className="flex-1 text-center sm:text-left">
                  <p className={`text-lg font-bold ${atsResult.score >= 70 ? 'text-green-400' : atsResult.score >= 45 ? 'text-amber-400' : 'text-red-400'}`}>
                    {atsResult.score >= 70 ? 'Strong match' : atsResult.score >= 45 ? 'Moderate match' : 'Needs improvement'}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">ATS Compatibility Score</p>
                  <p className="text-xs text-gray-300 mt-3 leading-relaxed">{atsResult.feedback}</p>
                </div>
              </div>

              {/* Matched / Missing */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-slate-800/30 rounded-xl p-4 border border-green-500/20">
                  <div className="flex items-center gap-1.5 mb-3">
                    <CheckCircle2 size={14} className="text-green-400" />
                    <span className="text-sm font-medium text-green-400">Matched ({atsResult.matchedKeywords.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {atsResult.matchedKeywords.map(kw => (
                      <span key={kw} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs bg-green-500/15 text-green-300 border border-green-500/25">
                        <CheckCircle2 size={10} /> {kw}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-800/30 rounded-xl p-4 border border-red-500/20">
                  <div className="flex items-center gap-1.5 mb-3">
                    <XCircle size={14} className="text-red-400" />
                    <span className="text-sm font-medium text-red-400">Missing ({atsResult.missingKeywords.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {atsResult.missingKeywords.map(kw => (
                      <span key={kw} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs bg-red-500/15 text-red-300 border border-red-500/25">
                        <XCircle size={10} /> {kw}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {atsResult.missingKeywords.length > 0 && (
                <div className="rounded-lg border border-purple-500/20 bg-purple-500/8 p-4 text-xs">
                  <p className="text-purple-300 font-semibold mb-1 flex items-center gap-1"><Tags size={12} /> Tip</p>
                  <p className="text-gray-300 leading-relaxed">
                    Add missing keywords to your <strong className="text-white">Skills</strong> section in the Build tab (if you genuinely have them),
                    then use the <strong className="text-white">Improve</strong> button on experience bullets to weave them in naturally.
                    Re-run ATS Check to see your updated score.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ GENERATE TAB ══════════════════════ */}
      {tab === 'generate' && (
        <div className={card}>
          <div className="flex items-center gap-2 mb-1">
            <Download size={18} className="text-purple-400" />
            <h2 className="font-semibold text-white">Download Resume</h2>
          </div>
          <p className="text-xs text-gray-400 mb-5">
            Generates a professional A4 resume matching the standard LaTeX format.
            Opens in a new tab — use the purple{' '}
            <strong className="text-white">Download / Print as PDF</strong> button inside.
          </p>

          {/* What's included */}
          <div className="mb-6 rounded-xl border border-purple-500/10 bg-slate-800/30 p-5 space-y-2 text-xs text-gray-400">
            <p className="font-semibold text-sm text-white mb-3 flex items-center gap-1.5">
              <Trophy size={15} className="text-amber-400" /> Resume Sections
            </p>
            {[
              'Header: Name · Phone · Location · Email · LinkedIn · Portfolio · GitHub',
              'Objective / Professional Summary',
              'Education — table with Degree | Institute | Year | Score',
              'Technical Skills — two-column: Category | Skills',
              'Experience — role, company, dates + bullet points',
              'Projects — name, stack, GitHub link + bullet points',
              'Certifications (clickable links)',
              'Achievements',
            ].map(item => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 size={12} className="text-purple-400 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-3 text-xs text-amber-300 mb-6">
            <strong>Tip:</strong> Fill the <strong>Build</strong> tab and click <strong>Save to Profile</strong> before generating.
            In the new tab, press <strong>Ctrl+P</strong> (or use the purple button) → <strong>Save as PDF</strong>.
          </div>

          {/* Live form summary */}
          <div className="mb-6 rounded-xl border border-purple-500/10 bg-slate-800/30 p-4 text-xs text-gray-400 space-y-1">
            <p className="text-white font-semibold mb-2 flex items-center gap-1.5"><Wand2 size={13} /> Current Build Data</p>
            {[
              ['Name', form.name || '—'],
              ['Headline', form.headline || '—'],
              ['Education', `${(form.education || []).filter(e => e.degree?.trim()).length} row(s)`],
              ['Experience', `${(form.experience || []).filter(e => e.title?.trim()).length} role(s)`],
              ['Projects', `${(form.projects || []).filter(p => p.name?.trim()).length} project(s)`],
              ['Skills', form.skillGroups?.length
                ? `${form.skillGroups.length} category/categories`
                : form.flatSkills ? 'Flat list' : '—'],
              ['Certifications', `${(form.certifications || []).filter(c => c.title?.trim()).length} row(s)`],
              ['Achievements', `${(form.achievements || []).filter(a => a?.trim()).length} row(s)`],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-gray-500 w-28 shrink-0">{k}</span>
                <span className="text-white">{v}</span>
              </div>
            ))}
          </div>

          <button onClick={handleDownloadResume} disabled={generating}
            className="w-full flex items-center justify-center gap-2 px-7 py-3 bg-gradient-to-r from-purple-600 to-blue-500 rounded-xl text-sm font-semibold text-white hover:shadow-lg glow-purple-hover smooth-transition disabled:opacity-50">
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {generating ? 'Generating…' : 'Download Resume'}
          </button>
        </div>
      )}
    </div>
  );
}
