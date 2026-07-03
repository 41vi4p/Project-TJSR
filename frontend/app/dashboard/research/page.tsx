'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck, Loader2, Search, KeyRound, CheckCircle2, XCircle,
  Circle, Clock, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import {
  fetchUserProfile, fetchResearchRequests, fetchResearchRequest,
  submitResearchRequest, slugifyCompany, fetchCompanyReport,
  RESEARCH_STAGES, type FSResearchRequest, type ResearchStage, type StageStatus,
} from '@/lib/firestore';

const STAGE_LABELS: Record<ResearchStage, string> = {
  validate: 'Validating request',
  cache_check: 'Checking cached research',
  collect: 'Gathering sources (web, news, reviews, GitHub)',
  red_flags: 'Running scam & red-flag checks',
  synthesize: 'Writing company report (AI)',
  position_analysis: 'Analysing your target role (AI)',
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-400/10 text-yellow-500 border-yellow-400/25',
    processing: 'bg-blue-400/10 text-blue-400 border-blue-400/25',
    processed: 'bg-green-400/10 text-green-400 border-green-400/25',
    failed: 'bg-red-400/10 text-red-400 border-red-400/25',
  };
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  );
}

function StageRow({ label, status }: { label: string; status: StageStatus }) {
  const icon =
    status === 'done' ? <CheckCircle2 size={15} className="text-green-400" /> :
    status === 'running' ? <Loader2 size={15} className="animate-spin text-yellow-500" /> :
    status === 'failed' ? <XCircle size={15} className="text-red-400" /> :
    <Circle size={15} className="theme-muted opacity-40" />;
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {icon}
      <span className={`text-sm ${status === 'pending' ? 'theme-muted' : 'theme-text'}`}>{label}</span>
    </div>
  );
}

export default function CompanyResearchPage() {
  const { user } = useAuth();

  const [hasGroqKey, setHasGroqKey] = useState<boolean | null>(null);
  const [requests, setRequests] = useState<FSResearchRequest[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const [companyName, setCompanyName] = useState('');
  const [position, setPosition] = useState('');
  const [jdText, setJdText] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeRequest, setActiveRequest] = useState<FSResearchRequest | null>(null);

  const loadRequests = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const list = await fetchResearchRequests(user.uid);
      setRequests(list);
      const running = list.find(r => r.status === 'pending' || r.status === 'processing');
      if (running) { setActiveId(running.id); setActiveRequest(running); }
    } catch { /* index may still be building; non-fatal */ }
    finally { setListLoading(false); }
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    fetchUserProfile(user.uid)
      .then(p => setHasGroqKey(Boolean(p?.api_keys?.groq)))
      .catch(() => setHasGroqKey(false));
    loadRequests();
  }, [user?.uid, loadRequests]);

  // Poll the active request while it's pending/processing (same pattern as the resume page)
  useEffect(() => {
    if (!activeId) return;
    const status = activeRequest?.status;
    if (status !== 'pending' && status !== 'processing') return;
    const interval = setInterval(async () => {
      try {
        const req = await fetchResearchRequest(activeId);
        if (!req) return;
        setActiveRequest(req);
        if (req.status === 'processed') {
          toast.success(`Background check on ${req.company_name} is ready!`);
          clearInterval(interval);
          loadRequests();
        } else if (req.status === 'failed') {
          toast.error(req.error ?? 'Research failed. Try again.');
          clearInterval(interval);
          loadRequests();
        }
      } catch { /* ignore polling errors */ }
    }, 8000);
    return () => clearInterval(interval);
  }, [activeId, activeRequest?.status, loadRequests]);

  async function handleSubmit() {
    if (!user?.uid) { toast.error('Sign in first'); return; }
    if (!companyName.trim()) { toast.error('Enter a company name'); return; }
    if (!position.trim()) { toast.error('Enter the position you are applying for'); return; }
    if (!consent) { toast.error('Please review and accept how your data is used'); return; }
    setSubmitting(true);
    try {
      // Optimistic cache hint — instant answer if this company was researched recently
      const slug = slugifyCompany(companyName);
      const cached = slug ? await fetchCompanyReport(slug).catch(() => null) : null;

      const id = await submitResearchRequest(user.uid, {
        companyName, position, jdText,
      });
      setActiveId(id);
      setActiveRequest({
        id, uid: user.uid, company_name: companyName, position,
        jd_text: jdText, consent: true, status: 'pending',
      } as FSResearchRequest);
      setCompanyName(''); setPosition(''); setJdText(''); setConsent(false);
      toast.info(cached
        ? 'Cached research found — your role analysis will be ready shortly.'
        : 'Background check started — this usually takes 2–5 minutes.');
      loadRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit request');
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = 'w-full rounded-lg border theme-border px-3 py-2.5 text-sm theme-text outline-none focus:border-yellow-400/60 transition-colors';
  const inputStyle = { backgroundColor: 'var(--card-bg2)' } as React.CSSProperties;

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold theme-text mb-1 flex items-center gap-2">
          <ShieldCheck className="text-yellow-500" size={28} /> Company Check
        </h1>
        <p className="text-gray-400 text-sm">
          Run a background check before you apply — culture, red flags, financial signals, and what the role really looks like.
        </p>
      </div>

      {/* Groq key warning */}
      {hasGroqKey === false && (
        <div className="brand-card dark-card rounded-xl p-4 mb-6 border border-yellow-400/30 flex items-start gap-3">
          <KeyRound size={18} className="text-yellow-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm theme-text">
            Company research uses <span className="font-semibold">your own Groq API key</span> (free at{' '}
            <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-yellow-500 underline">console.groq.com</a>).
            Add it in{' '}
            <Link href="/dashboard/settings" className="text-yellow-500 underline">Settings → API Keys</Link>{' '}
            before submitting.
          </div>
        </div>
      )}

      {/* Submit form */}
      <div className="brand-card dark-card rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold theme-muted mb-1.5">Company name *</label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)}
              placeholder="e.g. Acme Technologies Pvt Ltd" maxLength={120}
              className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs font-semibold theme-muted mb-1.5">Position you&apos;re applying for *</label>
            <input value={position} onChange={e => setPosition(e.target.value)}
              placeholder="e.g. Software Developer (Fresher)" maxLength={120}
              className={inputCls} style={inputStyle} />
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold theme-muted mb-1.5">Job description (optional — enables JD red-flag analysis)</label>
          <textarea value={jdText} onChange={e => setJdText(e.target.value)} rows={5}
            placeholder="Paste the JD here…" maxLength={15000}
            className={inputCls} style={inputStyle} />
        </div>

        {/* Consent */}
        <label className="flex items-start gap-2.5 mb-5 cursor-pointer select-none">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
            className="mt-0.5 accent-yellow-400" />
          <span className="text-xs theme-muted leading-relaxed">
            I understand that the company name, position, and JD text I submit will be processed by the
            TJSR backend, and that my Groq API key (stored in my account) will be used to generate this
            report. Company research results (not my position analysis or JD) are cached and shared with
            other signed-in users. See the{' '}
            <Link href="/privacy" className="text-yellow-500 underline" target="_blank">Privacy Policy</Link> and{' '}
            <Link href="/terms" className="text-yellow-500 underline" target="_blank">Terms</Link>.
          </span>
        </label>

        <button onClick={handleSubmit} disabled={submitting || !consent || hasGroqKey === false}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#FACC15] text-[#1F2937] rounded-lg text-sm font-semibold hover:shadow-lg smooth-transition disabled:opacity-50">
          {submitting ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          {submitting ? 'Submitting…' : 'Run Background Check'}
        </button>
      </div>

      {/* Active request progress */}
      {activeRequest && (activeRequest.status === 'pending' || activeRequest.status === 'processing') && (
        <div className="brand-card dark-card rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-yellow-500" />
            <h2 className="font-semibold theme-text">
              Researching {activeRequest.company_name}…
            </h2>
            <StatusBadge status={activeRequest.status} />
          </div>
          <div>
            {RESEARCH_STAGES.map(stage => (
              <StageRow key={stage} label={STAGE_LABELS[stage]}
                status={activeRequest.progress?.[stage]?.status ?? 'pending'} />
            ))}
          </div>
          <p className="text-xs theme-muted mt-3">
            The backend worker picks up requests every minute. A fresh company takes 2–5 minutes; recently
            researched companies are much faster.
          </p>
        </div>
      )}

      {/* Past requests */}
      <div className="brand-card dark-card rounded-xl p-6">
        <h2 className="font-semibold theme-text mb-4">Your background checks</h2>
        {listLoading ? (
          <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-yellow-500" /></div>
        ) : requests.length === 0 ? (
          <p className="text-sm theme-muted py-4">No checks yet — run your first one above.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {requests.map(req => {
              const clickable = req.status === 'processed';
              const inner = (
                <div className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium theme-text truncate">{req.company_name}</p>
                    <p className="text-xs theme-muted truncate">{req.position}</p>
                  </div>
                  {req.status === 'failed' && req.error && (
                    <span className="hidden sm:flex items-center gap-1 text-xs text-red-400 max-w-[40%] truncate">
                      <AlertTriangle size={12} className="flex-shrink-0" /> {req.error}
                    </span>
                  )}
                  <StatusBadge status={req.status} />
                  {clickable && <ChevronRight size={16} className="theme-muted flex-shrink-0" />}
                </div>
              );
              return clickable ? (
                <Link key={req.id} href={`/dashboard/research/${req.id}`} className="block hover:opacity-80 smooth-transition">
                  {inner}
                </Link>
              ) : (
                <div key={req.id}>{inner}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
