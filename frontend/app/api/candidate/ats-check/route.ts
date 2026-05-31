import { NextRequest, NextResponse } from 'next/server';

const COMMON_TECH_SKILLS = [
  'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'ruby', 'php', 'go', 'rust', 'swift', 'kotlin',
  'react', 'angular', 'vue', 'svelte', 'next.js', 'node.js', 'express', 'django', 'flask', 'spring boot',
  'html', 'css', 'sass', 'tailwind', 'bootstrap', 'material ui',
  'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'cassandra', 'elasticsearch',
  'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'terraform', 'jenkins', 'github actions', 'gitlab ci',
  'linux', 'unix', 'bash', 'shell', 'git', 'agile', 'scrum', 'kanban', 'jira', 'confluence',
  'machine learning', 'deep learning', 'nlp', 'computer vision', 'tensorflow', 'pytorch', 'scikit-learn', 'pandas', 'numpy',
  'data analysis', 'data engineering', 'spark', 'hadoop', 'kafka', 'airflow',
  'rest api', 'graphql', 'grpc', 'microservices', 'serverless', 'oauth', 'jwt',
  'ui/ux', 'figma', 'adobe xd', 'photoshop', 'illustrator',
  'sales', 'marketing', 'seo', 'sem', 'crm', 'project management', 'leadership', 'communication', 'problem solving'
];

function extractKeywords(text: string): string[] {
  const lowerText = text.toLowerCase();
  const foundKeywords = new Set<string>();

  // Extract known tech/skills
  COMMON_TECH_SKILLS.forEach(skill => {
    // Basic word boundary check. For terms with symbols like C++ or .NET, boundaries are tricky, so we use string inclusion or regex carefully.
    const escaped = skill.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(lowerText) || lowerText.includes(skill)) {
      // Use string includes for stuff like c++, next.js that don't match \b well.
      // But for normal words use word boundary to avoid partial matches
      if (/^[a-z]+$/.test(skill)) {
        if (regex.test(lowerText)) foundKeywords.add(skill);
      } else {
        if (lowerText.includes(skill)) foundKeywords.add(skill);
      }
    }
  });

  // Extract acronyms (3 to 6 uppercase letters are often tech/business terms)
  const acronyms = text.match(/\b[A-Z]{3,6}\b/g) || [];
  acronyms.forEach(acronym => {
    // Exclude common non-skill acronyms
    if (!['THE', 'AND', 'WITH', 'FOR', 'EOF', 'API', 'HTTP', 'HTTPS', 'URL'].includes(acronym)) {
      foundKeywords.add(acronym.toLowerCase());
    }
  });

  return Array.from(foundKeywords);
}

export async function POST(req: NextRequest) {
  try {
    const { profile, jobDescription } = await req.json();
    if (!profile || !jobDescription) {
      return NextResponse.json({ error: 'Missing profile or job description' }, { status: 400 });
    }

    // Combine candidate's profile into a searchable text block
    const resumeText = [
      profile.headline,
      profile.flatSkills,
      ...(profile.skillGroups || []).map((g: { category: string; skills: string }) => `${g.category}: ${g.skills}`),
      ...(profile.education || []).map((e: { degree: string; institution: string }) => `${e.degree} ${e.institution}`),
      ...(profile.experience || []).map((e: { title: string; company: string; description: string }) =>
        `${e.title} at ${e.company}: ${e.description}`),
      ...(profile.projects || []).map((p: { name: string; techStack: string; description: string }) =>
        `${p.name} (${p.techStack}): ${p.description}`),
      ...(profile.certifications || []).map((c: { title: string }) => c.title),
      ...(profile.achievements || []),
    ].filter(Boolean).join('\n').toLowerCase();

    // 1. Identify important skills/keywords required by the Job Description
    const requiredKeywords = extractKeywords(jobDescription);
    
    // 2. See which ones the candidate has
    const matchedKeywords: string[] = [];
    const missingKeywords: string[] = [];
    
    requiredKeywords.forEach(kw => {
      // Check if keyword exists in resume text
      const escaped = kw.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`);
      
      // Using .includes for symbols and regex for standard words to avoid partial matching "go" inside "good"
      const isPresent = /^[a-z0-9]+$/.test(kw) ? regex.test(resumeText) : resumeText.includes(kw);

      if (isPresent) {
        matchedKeywords.push(kw);
      } else {
        missingKeywords.push(kw);
      }
    });

    // 3. Score calculation
    let score = 0;
    
    if (requiredKeywords.length === 0) {
      // If the JD had no recognizable keywords, give a fallback score based on resume length/depth
      score = resumeText.length > 500 ? 70 : 40;
    } else {
      const matchRatio = matchedKeywords.length / requiredKeywords.length;
      score = Math.round(matchRatio * 100);
    }
    
    // Generous curve (a 60% keyword match is usually considered excellent for ATS)
    // 60% real match -> 90 ATS score
    let adjustedScore = Math.min(100, Math.round(score * 1.5));
    if (requiredKeywords.length < 3) adjustedScore = Math.min(85, adjustedScore + 20);

    // Provide dynamic textual feedback based on metrics
    let feedback = '';
    if (adjustedScore >= 80) {
      feedback = 'Excellent match! Your profile aligns very well with the core requirements of this role. Your skills and keywords strongly mirror the job description.';
    } else if (adjustedScore >= 50) {
      feedback = 'Good start. You have a fair amount of overlapping skills, but consider adapting your bullet points to specifically address the missing keywords highlighted below.';
    } else {
      feedback = 'Low match. Your profile seems to lack several core technologies or keywords mentioned in the job description. Review the missing keywords and ensure you add them to your experience if you possess those skills.';
    }

    // Capitalize keywords for nicer UI display
    const formatKw = (arr: string[]) => arr.map(w => w.charAt(0).toUpperCase() + w.slice(1)).slice(0, 20);

    return NextResponse.json({
      score: adjustedScore,
      matchedKeywords: formatKw(matchedKeywords),
      missingKeywords: formatKw(missingKeywords),
      feedback,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'ATS check failed';
    console.error('[/api/candidate/ats-check]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
