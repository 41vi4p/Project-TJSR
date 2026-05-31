import { NextRequest, NextResponse } from 'next/server';
const { PDFParse } = require('pdf-parse');

export const runtime = 'nodejs';

// ─── ATS Score Calculator ─────────────────────────────────────────────────────

const ATS_KEYWORDS = [
  // Programming Languages
  "javascript", "python", "java", "c", "c++", "c#", "typescript", "go", "rust", "kotlin", "swift",
  // Web Development
  "html", "css", "react", "next.js", "angular", "vue", "node", "express", "rest api", "graphql",
  // AI / ML
  "machine learning", "deep learning", "nlp", "computer vision", "tensorflow", "pytorch", "scikit-learn",
  // Data Science
  "data analysis", "pandas", "numpy", "matplotlib", "power bi", "tableau", "excel",
  // Databases
  "mongodb", "mysql", "postgresql", "firebase", "sql", "redis", "dynamodb",
  // Cloud & DevOps
  "aws", "azure", "gcp", "docker", "kubernetes", "ci/cd", "jenkins", "github actions",
  // Cybersecurity
  "cybersecurity", "penetration testing", "ethical hacking", "network security", "encryption",
  // Mobile Development
  "android", "ios", "flutter", "react native", "swift", "kotlin",
  // Tools & Version Control
  "git", "github", "gitlab", "bitbucket", "jira", "postman",
  // Other Skills
  "problem solving", "algorithms", "data structures", "oop", "system design",
];

const SECTION_DEFS = [
  { name: 'Contact Info',      keywords: ['phone', 'email', 'linkedin', 'github', 'portfolio', '@', '.com'] },
  { name: 'Summary / Profile', keywords: ['summary', 'objective', 'profile', 'about', 'overview'] },
  { name: 'Education',         keywords: ['education', 'degree', 'university', 'college', 'bachelor', 'master', 'b.e', 'b.tech', 'b.sc', 'cgpa', 'gpa'] },
  { name: 'Work Experience',   keywords: ['experience', 'employment', 'intern', 'engineer', 'developer', 'analyst', 'manager', 'work history'] },
  { name: 'Skills',            keywords: ['skills', 'technologies', 'technical', 'proficiency', 'tools', 'languages'] },
  { name: 'Projects',          keywords: ['project', 'portfolio', 'built', 'developed', 'created', 'implemented'] },
  { name: 'Certifications',    keywords: ['certification', 'certificate', 'certified', 'credential', 'course'] },
  { name: 'Achievements',      keywords: ['achievement', 'award', 'recognition', 'honor', 'ranked', 'winner', 'prize'] },
];

function calcSectionScores(text: string) {
  const lower = text.toLowerCase();
  return SECTION_DEFS.map(s => {
    if (s.name === 'Contact Info') {
      const hasEmail = /@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text);
      const hasPhone = /\d{3,}[\s-]?\d{3,}[\s-]?\d{3,}/.test(text);
      return { name: s.name, present: hasEmail || hasPhone || s.keywords.some(k => lower.includes(k)) };
    }
    return { name: s.name, present: s.keywords.some(k => lower.includes(k)) };
  });
}

function analyzeTextLocal(text: string) {
  if (!text) return null;

  const lower = text.toLowerCase();

  // ── Keyword matching (70 pts) ─────────────────────────────────────────────
  let matchedKeywords = 0;
  const matchedList: string[] = [];
  ATS_KEYWORDS.forEach(word => {
    if (lower.includes(word)) {
      matchedKeywords++;
      matchedList.push(word);
    }
  });
  const keywordScore = (matchedKeywords / ATS_KEYWORDS.length) * 70;

  // ── Resume length score (20 pts) ─────────────────────────────────────────
  const lengthScore = lower.length > 1200 ? 20 : (lower.length / 1200) * 20;

  // ── Section detection (20 pts) ────────────────────────────────────────────
  let sectionScore = 0;
  if (lower.includes("experience")) sectionScore += 5;
  if (lower.includes("projects"))   sectionScore += 5;
  if (lower.includes("education"))  sectionScore += 5;
  if (lower.includes("skills"))     sectionScore += 5;

  // ── Diversity bonus (10 pts) ──────────────────────────────────────────────
  const diversityScore = matchedKeywords > 15 ? 10 : 0;

  // ── Final score ───────────────────────────────────────────────────────────
  const raw = keywordScore + lengthScore + sectionScore + diversityScore;
  const finalScore = Math.min(100, Math.round(raw));

  // ── Section scores for UI ─────────────────────────────────────────────────
  const sectionScores = calcSectionScores(text);
  const presentCount = sectionScores.filter(s => s.present).length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const strengths: string[] = [];
  const improvements: string[] = [];

  if (matchedKeywords > 15) strengths.push(`Excellent keyword coverage — ${matchedKeywords} tech skills detected.`);
  else if (matchedKeywords > 8) strengths.push(`Good keyword coverage — ${matchedKeywords} tech skills detected.`);
  if (sectionScore >= 15) strengths.push('Key sections (Experience, Projects, Education, Skills) are present.');
  if (lower.length > 1200) strengths.push('Resume length is sufficient for ATS parsing.');

  if (matchedKeywords <= 8) improvements.push(`Add more technical skills — only ${matchedKeywords} of ${ATS_KEYWORDS.length} keywords matched.`);
  if (sectionScore < 20) {
    const missingSections = ['experience', 'projects', 'education', 'skills'].filter(s => !lower.includes(s));
    if (missingSections.length) improvements.push(`Add missing sections: ${missingSections.join(', ')}.`);
  }
  if (lower.length <= 1200) improvements.push('Expand your resume — more detail helps ATS systems find relevant content.');

  return {
    score: finalScore,
    matchedKeywords,
    totalKeywords: ATS_KEYWORDS.length,
    matchedList,
    lengthScore: Math.round(lengthScore),
    sectionScore,
    diversityScore,
    strengths,
    improvements,
    sectionScores,
    quantification: matchedKeywords > 15 ? 'Good' : matchedKeywords > 8 ? 'Moderate' : 'Low',
    actionVerbs: matchedKeywords > 15 ? 'Strong' : matchedKeywords > 8 ? 'Moderate' : 'Weak',
    wordCount,
  };
}

function parseResumeEntities(text: string) {
  const result: Record<string, any> = {
    name: '',
    email: '',
    phone: '',
    linkedin: '',
    github: '',
    flatSkills: '',
    bio: ''
  };

  // Extract Email
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) result.email = emailMatch[0];

  // Extract Phone
  const phoneMatch = text.match(/(?:\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/);
  if (phoneMatch) result.phone = phoneMatch[0];

  // Extract Links
  const linkMatches = text.match(/(?:https?:\/\/)?(?:www\.)?(linkedin\.com\/in\/[a-zA-Z0-9_-]+|github\.com\/[a-zA-Z0-9_-]+)/g);
  if (linkMatches) {
    linkMatches.forEach(link => {
      if (link.includes('linkedin.com')) result.linkedin = link.replace(/https?:\/\/(www\.)?/, '');
      if (link.includes('github.com')) result.github = link.replace(/https?:\/\/(www\.)?/, '');
    });
  }

  // Name heuristic
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length > 0) {
    for (let i = 0; i < Math.min(5, lines.length); i++) {
        const line = lines[i];
        const nameMatch = line.match(/^[A-Z][a-z]+\s+[A-Z][a-z]+/);
        if (nameMatch) {
          result.name = nameMatch[0];
          break;
        } else {
          const firstFew = line.split(/\s+/).slice(0, 3).join(' ');
          // only accept as name if it's strictly letters and spaces, no numbers/files/symbols
          if (firstFew.length < 30 && /^[A-Za-z\s]+$/.test(firstFew) && !firstFew.toLowerCase().includes('pdf')) {
            result.name = firstFew;
            break;
          }
        }
    }
  }

  // Very basic Skills extraction strategy (look for common programming languages/tools)
  const commonTech = ['Python','Java','C++','C#','JavaScript','TypeScript','React','Node.js','Express','Angular','Vue','SQL','MySQL','PostgreSQL','MongoDB','AWS','Docker','Kubernetes','Git','Linux','HTML','CSS'];
  const foundTech = commonTech.filter(tech => {
    const escaped = tech.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text) || text.includes(tech);
  });
  if (foundTech.length > 0) {
    result.flatSkills = foundTech.join(', ');
  }

  // Section splitting heuristic
  const headerRegex = /(?:\n|^)\s*(SUMMARY|PROFILE|OBJECTIVE|EXPERIENCE|EMPLOYMENT|WORK HISTORY|PROJECTS|EDUCATION|SKILLS|TECHNICAL SKILLS|CERTIFICATIONS|ACHIEVEMENTS|AWARDS)\s*(?:\n|$)/gi;
  let match;
  let lastIndex = 0;
  let lastHeader = 'summary'; // Top content is usually summary or contact info
  const splits: {header: string, content: string}[] = [];
  
  while ((match = headerRegex.exec(text)) !== null) {
      if (lastIndex < match.index) {
          splits.push({ header: lastHeader, content: text.substring(lastIndex, match.index).trim() });
      }
      lastHeader = match[1].toLowerCase();
      lastIndex = headerRegex.lastIndex;
  }
  splits.push({ header: lastHeader, content: text.substring(lastIndex).trim() });

  splits.forEach(({ header, content }) => {
    if (!content) return;
    if (header.includes('summary') || header.includes('profile') || header.includes('objective')) {
      // Don't overwrite if we already have something better, but usually we just accumulate
      result.bio = result.bio ? result.bio + '\n\n' + content : content;
    }
    else if (header.includes('experience') || header.includes('employment') || header.includes('work')) {
      result.experience = [{ title: 'Extracted Role', company: 'Extracted Company', startDate: '', endDate: '', current: false, description: content }];
    }
    else if (header.includes('project')) {
      result.projects = [{ name: 'Extracted Project', url: '', techStack: '', description: content }];
    }
    else if (header.includes('education')) {
      result.education = [{ degree: 'Extracted Education', institution: content.slice(0, 50), year: '', cgpa: '', field: '' }];
    }
    else if (header.includes('certifications')) {
      result.certifications = [{ title: 'Extracted Certifications', url: content.slice(0, 100) }];
    }
    else if (header.includes('achievements') || header.includes('awards')) {
      result.achievements = content.split('\n').filter(l => l.trim().length > 3).slice(0, 5);
    }
    else if (header.includes('skills')) {
      // Append text skills to the found common skills
      result.flatSkills = result.flatSkills ? result.flatSkills + ', ' + content.replace(/\n/g, ', ') : content.replace(/\n/g, ', ');
    }
  });

  return result;
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    let text = '';
    const ct = req.headers.get('content-type') ?? '';

    if (ct.includes('multipart/form-data')) {
      const fd = await req.formData();
      const file = fd.get('file') as File | null;
      if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
      
      if (file.name.endsWith('.pdf')) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const parser = new PDFParse({ data: buffer });
          const parsed = await parser.getText();
          await parser.destroy();
          text = parsed.text ?? '';
        } catch (pdfErr) {
          console.error('[analyze-local] PDF parse error:', pdfErr instanceof Error ? pdfErr.message : pdfErr);
          return NextResponse.json(
            { error: 'Could not extract text from this PDF. Please use "Paste text" instead.' },
            { status: 422 }
          );
        }
      } else {
        text = await file.text();
      }
    } else {
      text = (await req.json()).text ?? '';
    }

    text = text.replace(/\s{4,}/g, '   ').trim().slice(0, 15000);

    if (text.replace(/\s/g, '').length < 30) {
      return NextResponse.json({
        error: 'Could not read text from this PDF. Please use "Paste text" instead.',
      }, { status: 422 });
    }

    console.log('[analyze-local] Extracted text length:', text.length);

    const analysis = analyzeTextLocal(text);
    if (!analysis) return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });

    const parsedForm = parseResumeEntities(text);
    if (!parsedForm.bio && (!parsedForm.experience || parsedForm.experience.length === 0)) {
      parsedForm.bio = text;
    }

    return NextResponse.json({
      text,
      score: analysis.score,
      matchedKeywords: analysis.matchedKeywords,
      totalKeywords: analysis.totalKeywords,
      matchedList: analysis.matchedList,
      lengthScore: analysis.lengthScore,
      sectionScore: analysis.sectionScore,
      diversityScore: analysis.diversityScore,
      wordCount: analysis.wordCount,
      strengths: analysis.strengths,
      improvements: analysis.improvements,
      sectionScores: analysis.sectionScores,
      quantification: analysis.quantification,
      actionVerbs: analysis.actionVerbs,
      parsedForm,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[analyze-local] ERROR:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
