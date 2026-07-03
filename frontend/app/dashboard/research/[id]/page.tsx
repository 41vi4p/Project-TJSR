'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ShieldCheck, ShieldAlert, AlertTriangle, Info as InfoIcon, ArrowLeft,
  ExternalLink, Building2, Users, Landmark, Cpu, UserRound, Loader2,
  FileSearch, Briefcase,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  fetchResearchRequest, fetchCompanyReport,
  type FSCompanyReport, type FSResearchRequest, type FSReportSection, type FSRedFlag,
} from '@/lib/firestore';

// ─── Red flag card ────────────────────────────────────────────────────────────

const FLAG_STYLES: Record<string, { border: string; bg: string; text: string; Icon: typeof ShieldAlert }> = {
  high:   { border: 'border-red-400/40',    bg: 'bg-red-400/10',    text: 'text-red-400',    Icon: ShieldAlert },
  medium: { border: 'border-orange-400/40', bg: 'bg-orange-400/10', text: 'text-orange-400', Icon: AlertTriangle },
  low:    { border: 'border-yellow-400/40', bg: 'bg-yellow-400/10', text: 'text-yellow-500', Icon: AlertTriangle },
  info:   { border: 'border-blue-400/30',   bg: 'bg-blue-400/5',    text: 'text-blue-400',   Icon: InfoIcon },
};

function RedFlagCard({ flag }: { flag: FSRedFlag }) {
  const s = FLAG_STYLES[flag.severity] ?? FLAG_STYLES.info;
  const Icon = s.Icon;
  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-4 flex items-start gap-3`}>
      <Icon size={18} className={`${s.text} mt-0.5 flex-shrink-0`} />
      <div className="min-w-0">
        <p className={`text-xs font-bold uppercase tracking-wide ${s.text} mb-1`}>
          {flag.signal.replace(/_/g, ' ')} · {flag.severity}
        </p>
        <p className="text-sm theme-text leading-relaxed">{flag.detail}</p>
        {flag.evidence_url && (
          <a href={flag.evidence_url} target="_blank" rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 text-xs ${s.text} underline mt-1.5`}>
            View evidence <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Report section (markdown + citations) ───────────────────────────────────

function SectionBody({ section }: { section: FSReportSection }) {
  if (section.insufficient) {
    return (
      <div className="rounded-lg border theme-border px-4 py-3 flex items-center gap-2"
           style={{ backgroundColor: 'var(--card-bg2)' }}>
        <FileSearch size={15} className="theme-muted" />
        <span className="text-sm theme-muted italic">
          Insufficient data — not enough public evidence to report on this.
        </span>
      </div>
    );
  }
  return (
    <div>
      <div className="prose prose-sm prose-invert max-w-none text-sm theme-text leading-relaxed
                      [&_a]:text-yellow-500 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mb-2">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.text_md}</ReactMarkdown>
      </div>
      {section.citations.length > 0 && (
        <p className="text-xs theme-muted mt-2">
          Sources:{' '}
          {section.citations.map(c => (
            <a key={c} href={`#source-${c}`} className="text-yellow-500 hover:underline mr-1">[{c}]</a>
          ))}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const COMPANY_TABS = [
  { key: 'overview',          label: 'Overview',   Icon: Building2 },
  { key: 'clients_products',  label: 'Clients',    Icon: Briefcase },
  { key: 'culture_reviews',   label: 'Culture',    Icon: Users },
  { key: 'financial_signals', label: 'Financials', Icon: Landmark },
  { key: 'tech_stack',        label: 'Tech Stack', Icon: Cpu },
  { key: 'your_role',         label: 'Your Role',  Icon: UserRound },
] as const;

const POSITION_LABELS: Record<string, string> = {
  likely_projects: 'Likely projects you would work on',
  exposure_learning: 'Exposure & learning',
  common_stack: 'Common tech stack for this role',
  jd_notes: 'Notes on the job description',
};

export default function ResearchReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();

  const [request, setRequest] = useState<FSResearchRequest | null>(null);
  const [report, setReport] = useState<FSCompanyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof COMPANY_TABS)[number]['key']>('overview');

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      try {
        const req = await fetchResearchRequest(id);
        if (!req) { setError('Report not found.'); return; }
        if (req.uid !== user.uid) { setError('This report belongs to another account.'); return; }
        setRequest(req);
        if (req.company_report_slug) {
          const rep = await fetchCompanyReport(req.company_report_slug);
          if (!rep) { setError('The company report has expired — run a new check.'); return; }
          setReport(rep);
        } else {
          setError(req.status === 'failed'
            ? (req.error ?? 'This check failed — run a new one.')
            : 'This check has not finished yet.');
        }
      } catch {
        setError('Could not load the report.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user?.uid]);

  if (loading) {
    return (
      <div className="max-w-4xl flex justify-center py-24">
        <Loader2 size={28} className="animate-spin text-yellow-500" />
      </div>
    );
  }

  if (error || !report || !request) {
    return (
      <div className="max-w-4xl">
        <Link href="/dashboard/research" className="inline-flex items-center gap-1.5 text-sm theme-muted hover:text-yellow-500 smooth-transition mb-6">
          <ArrowLeft size={15} /> Back to Company Check
        </Link>
        <div className="brand-card dark-card rounded-xl p-8 text-center">
          <AlertTriangle size={28} className="mx-auto text-yellow-500 mb-3" />
          <p className="theme-text">{error ?? 'Report unavailable.'}</p>
        </div>
      </div>
    );
  }

  const highFlags = report.red_flags.filter(f => f.severity === 'high');
  const otherFlags = report.red_flags.filter(f => f.severity !== 'high');
  const positionSections = request.position_analysis?.sections;

  return (
    <div className="max-w-4xl">
      <Link href="/dashboard/research" className="inline-flex items-center gap-1.5 text-sm theme-muted hover:text-yellow-500 smooth-transition mb-4">
        <ArrowLeft size={15} /> Back to Company Check
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold theme-text flex items-center gap-2.5 mb-1">
          <ShieldCheck className={highFlags.length ? 'text-red-400' : 'text-green-400'} size={28} />
          {report.company_name_canonical}
        </h1>
        <p className="text-sm theme-muted">
          Background check for <span className="theme-text font-medium">{request.position}</span>
          {' · '}generated {report.generated_at?.toDate?.().toLocaleDateString?.() ?? ''}
          {' · '}{report.sources.length} sources
        </p>
        <p className="text-xs theme-muted mt-1.5">
          AI-generated from public sources — findings (including red flags) may be incorrect or
          incomplete. Verify via the cited sources before making decisions.
        </p>
      </div>

      {/* Red flags first — the whole point of the feature */}
      {report.red_flags.length > 0 && (
        <div className="space-y-3 mb-8">
          {highFlags.map((f, i) => <RedFlagCard key={`h${i}`} flag={f} />)}
          {otherFlags.map((f, i) => <RedFlagCard key={`o${i}`} flag={f} />)}
        </div>
      )}

      {/* Review deep links */}
      {report.review_links.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {report.review_links.slice(0, 6).map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border theme-border theme-text hover:border-yellow-400/50 smooth-transition"
              style={{ backgroundColor: 'var(--card-bg2)' }}>
              Reviews on {l.platform} <ExternalLink size={11} />
            </a>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 [background:var(--card-bg2)] border theme-border rounded-xl p-1 mb-6 overflow-x-auto">
        {COMPANY_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 px-3 text-sm font-medium whitespace-nowrap transition-all ${
              tab === t.key ? 'bg-[#FACC15] text-[#1F2937] shadow-lg' : 'text-gray-400 hover:text-[var(--text-main)]'
            }`}>
            <t.Icon size={15} />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="brand-card dark-card rounded-xl p-6 mb-8">
        {tab === 'your_role' ? (
          positionSections ? (
            <div className="space-y-6">
              {Object.entries(POSITION_LABELS).map(([key, label]) => {
                const sec = positionSections[key as keyof typeof positionSections];
                if (!sec) return null;
                return (
                  <div key={key}>
                    <h3 className="text-sm font-bold theme-text mb-2">{label}</h3>
                    <SectionBody section={sec} />
                  </div>
                );
              })}
              {report.internal_jobs_signal.active_postings > 0 && (
                <div className="rounded-lg border theme-border p-4" style={{ backgroundColor: 'var(--card-bg2)' }}>
                  <p className="text-xs font-bold theme-muted uppercase tracking-wide mb-1.5">From TJSR&apos;s own job database</p>
                  <p className="text-sm theme-text">
                    {report.internal_jobs_signal.active_postings} active postings from this company.
                    {report.internal_jobs_signal.top_skills.length > 0 &&
                      ` Most-required skills: ${report.internal_jobs_signal.top_skills.slice(0, 8).join(', ')}.`}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm theme-muted italic">Position analysis unavailable for this request.</p>
          )
        ) : (
          <SectionBody section={report.sections[tab as keyof typeof report.sections]} />
        )}
      </div>

      {/* Sources */}
      <div className="brand-card dark-card rounded-xl p-6">
        <h2 className="font-semibold theme-text mb-4">Sources ({report.sources.length})</h2>
        <ol className="space-y-2">
          {report.sources.map(s => (
            <li key={s.id} id={`source-${s.id}`} className="text-sm flex items-baseline gap-2">
              <span className="text-yellow-500 font-mono text-xs flex-shrink-0">[{s.id}]</span>
              {s.url.startsWith('http') ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer"
                  className="theme-text hover:text-yellow-500 smooth-transition truncate">
                  {s.title || s.url} <span className="theme-muted text-xs">({s.domain} · {s.kind})</span>
                </a>
              ) : (
                <span className="theme-text truncate">{s.title} <span className="theme-muted text-xs">({s.kind})</span></span>
              )}
            </li>
          ))}
        </ol>
        <p className="text-xs theme-muted mt-5 leading-relaxed">
          This report is an AI-generated summary of public sources with automated heuristic checks. It can
          be incomplete or wrong — verify via the sources above before making career decisions. Company
          reports are cached and shared with other signed-in users; your position analysis is private.
        </p>
      </div>
    </div>
  );
}
