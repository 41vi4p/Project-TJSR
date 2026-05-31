import { NextRequest, NextResponse } from 'next/server';

interface EduRow      { degree: string; institution: string; year: string; cgpa: string; field: string }
interface ExpRow      { title: string; company: string; startDate: string; endDate: string; current: boolean; description: string }
interface ProjRow     { name: string; url: string; techStack: string; description: string }
interface CertRow     { title: string; url: string }
interface SkillGroup  { category: string; skills: string }

interface ResumeForm {
  name: string; phone: string; email: string; headline: string; location: string;
  github: string; linkedin: string; portfolio: string;
  bio: string; flatSkills: string;
  skillGroups: SkillGroup[];
  education: EduRow[];
  experience: ExpRow[];
  projects: ProjRow[];
  certifications: CertRow[];
  achievements: string[];
}

function e(s: string): string {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function bullets(text: string): string {
  return (text || '').split('\n').filter(b => b.trim())
    .map(b => `<li>${e(b.trim().replace(/^[-•*–]\s*/, ''))}</li>`).join('');
}

function buildPrintHTML(form: ResumeForm): string {
  const skills = form.skillGroups?.length
    ? form.skillGroups
    : form.flatSkills ? [{ category: 'Technical Skills', skills: form.flatSkills }] : [];

  const contactParts: string[] = [];
  if (form.phone) contactParts.push(e(form.phone));
  if (form.location) contactParts.push(e(form.location));

  const linkParts: string[] = [];
  if (form.email) linkParts.push(`<a href="mailto:${e(form.email)}">${e(form.email)}</a>`);
  if (form.linkedin) linkParts.push(`<a href="https://${e(form.linkedin)}">LinkedIn</a>`);
  if (form.portfolio) linkParts.push(`<a href="https://${e(form.portfolio)}">Portfolio</a>`);
  if (form.github) linkParts.push(`<a href="https://${e(form.github)}">GitHub</a>`);

  const eduRows = (form.education || []).filter(r => r.degree?.trim()).map(r => `
    <tr>
      <td>${e(r.degree)}${r.field ? ` (${e(r.field)})` : ''}</td>
      <td>${e(r.institution)}</td>
      <td>${e(r.year)}</td>
      <td>${e(r.cgpa)}</td>
    </tr>`).join('');

  const expSection = (form.experience || []).filter(r => r.title?.trim()).map(r => `
    <div class="block">
      <div class="block-hdr">
        <strong>${e(r.title)} &mdash; ${e(r.company)}</strong>
        <span class="date">${e(r.startDate)}${r.startDate ? ' &ndash; ' : ''}${r.current ? 'Present' : e(r.endDate)}</span>
      </div>
      <ul>${bullets(r.description)}</ul>
    </div>`).join('');

  const projSection = (form.projects || []).filter(r => r.name?.trim()).map(r => `
    <div class="block">
      <div class="block-hdr">
        <strong>${e(r.name)}${r.url ? ` &mdash; <a href="https://${e(r.url)}">${e(r.url)}</a>` : ''}</strong>
      </div>
      ${r.techStack ? `<div class="tech">Stack: ${e(r.techStack)}</div>` : ''}
      <ul>${bullets(r.description)}</ul>
    </div>`).join('');

  const certSection = (form.certifications || []).filter(r => r.title?.trim())
    .map(r => `<li>${r.url ? `<a href="${e(r.url)}">${e(r.title)}</a>` : e(r.title)}</li>`).join('');

  const achSection = (form.achievements || []).filter(a => a?.trim())
    .map(a => `<li>${e(a)}</li>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${e(form.name || 'Resume')}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  
  .print-btn {
    display: block;
    text-align: center;
    padding: 12px;
    background: #5b21b6;
    color: white;
    font: 600 14px/1 system-ui;
    cursor: pointer;
    border: none;
    width: 100%;
    margin-bottom: 0;
  }
  .print-btn:hover { background: #4c1d95; }

  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 10.5pt;
    line-height: 1.45;
    color: #111;
    background: #fff;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 17.78mm 17.78mm; /* 0.7in all sides */
    background: #fff;
  }

  /* ── Header ── */
  h1.resume-name {
    font-size: 20pt;
    font-weight: bold;
    text-transform: uppercase;
    text-align: center;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .contact-line {
    text-align: center;
    font-size: 10pt;
    color: #333;
    margin-bottom: 2px;
  }
  .contact-line a { color: #111; text-decoration: none; }
  .contact-line a:hover { text-decoration: underline; }
  .sep { margin: 0 5px; color: #666; }

  hr.rule {
    border: none;
    border-top: 2px solid #111;
    margin: 6px 0 0 0;
  }

  /* ── Sections ── */
  .sec-title {
    font-size: 11pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1px solid #333;
    padding-bottom: 1px;
    margin: 10px 0 5px;
  }

  /* ── Objective/Summary ── */
  p.summary {
    font-size: 10.5pt;
    text-align: justify;
    color: #222;
    margin: 0;
  }

  /* ── Education table ── */
  table.edu-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
  }
  table.edu-table th, table.edu-table td {
    border: 1px solid #555;
    padding: 3px 6px;
    vertical-align: top;
  }
  table.edu-table th {
    font-weight: bold;
    background: #f5f5f5;
  }
  table.edu-table td:nth-child(3), table.edu-table td:nth-child(4) {
    white-space: nowrap;
    text-align: center;
  }

  /* ── Skills ── */
  table.skill-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5pt;
  }
  table.skill-table td {
    padding: 2px 4px;
    vertical-align: top;
  }
  table.skill-table td:first-child {
    font-weight: 600;
    width: 34%;
    padding-right: 8px;
    white-space: nowrap;
  }

  /* ── Experience / Projects ── */
  .block { margin-bottom: 7px; }
  .block-hdr {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    margin-bottom: 2px;
  }
  .block-hdr strong { font-size: 10.5pt; }
  .date {
    font-size: 10pt;
    color: #333;
    white-space: nowrap;
    margin-left: 8px;
  }
  .tech {
    font-size: 9.5pt;
    color: #444;
    font-style: italic;
    margin-bottom: 2px;
  }
  ul {
    padding-left: 16px;
    margin: 0;
  }
  ul li { font-size: 10.5pt; color: #222; margin-bottom: 1px; }

  /* ── Misc ── */
  .cert-list { list-style: disc; padding-left: 16px; }
  .cert-list li a { color: #111; text-decoration: none; }
  .cert-list li a:hover { text-decoration: underline; }

  /* ── Print ── */
  @media print {
    .print-btn { display: none !important; }
    body { background: white; }
    .page { width: 100%; padding: 12mm 15mm; margin: 0; min-height: unset; }
    @page { margin: 0; size: A4; }
  }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">⬇ Download / Print as PDF &nbsp;(Ctrl+P → Save as PDF)</button>

<div class="page">
  <h1 class="resume-name">${e(form.name || 'YOUR NAME')}</h1>

  ${contactParts.length ? `<p class="contact-line">${contactParts.join('<span class="sep">$\\cdot$</span>').replace(/\\\$\\cdot\\\$/g, '·')}</p>` : ''}
  ${linkParts.length ? `<p class="contact-line">${linkParts.join('<span class="sep">·</span>')}</p>` : ''}

  <hr class="rule">

  ${form.bio?.trim() ? `
  <div class="sec-title">Objective</div>
  <p class="summary">${e(form.bio)}</p>` : ''}

  ${eduRows ? `
  <div class="sec-title">Education</div>
  <table class="edu-table">
    <thead>
      <tr>
        <th>Degree</th>
        <th>Institute</th>
        <th>Year</th>
        <th>Score</th>
      </tr>
    </thead>
    <tbody>${eduRows}</tbody>
  </table>` : ''}

  ${skills.some(g => g.skills?.trim()) ? `
  <div class="sec-title">Technical Skills</div>
  <table class="skill-table">
    ${skills.filter(g => g.skills?.trim()).map(g => `<tr><td>${e(g.category)}</td><td>${e(g.skills)}</td></tr>`).join('')}
  </table>` : ''}

  ${expSection ? `
  <div class="sec-title">Experience</div>
  ${expSection}` : ''}

  ${projSection ? `
  <div class="sec-title">Projects</div>
  ${projSection}` : ''}

  ${certSection ? `
  <div class="sec-title">Certifications</div>
  <ul class="cert-list">${certSection}</ul>` : ''}

  ${achSection ? `
  <div class="sec-title">Achievements</div>
  <ul>${achSection}</ul>` : ''}
</div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  try {
    const { profile } = await req.json();
    if (!profile) return NextResponse.json({ error: 'Profile data missing' }, { status: 400 });
    const html = buildPrintHTML(profile as ResumeForm);
    return NextResponse.json({ html });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Export failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
