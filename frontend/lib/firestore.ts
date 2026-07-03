import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteField,
  addDoc, serverTimestamp,
  query, where, orderBy, limit, startAfter, QueryConstraint,
  type DocumentData, type QueryDocumentSnapshot, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ─── Shared types (mirrors backend Job model) ─────────────────────────────────

export interface FSJob {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  skills: string[];
  job_type: string;
  salary: string;
  apply_link: string;
  source_url: string;
  source_name: string;
  is_tech: boolean | null;
  is_active: boolean;
  confidence_score: number | null;
  match_score: number;
  date_posted: Timestamp | null;
  date_scraped: Timestamp;
  created_at: Timestamp;
}

export interface FSDashboardStats {
  total_jobs: number;
  jobs_today: number;
  matched_jobs: number;
  tech_jobs: number;
  non_tech_jobs: number;
  total_jobs_change: number;
  jobs_today_change: number;
  matched_jobs_change: number;
  recent_activity: { id: string; source: string; level: string; message: string; timestamp: string }[];
  last_updated: Timestamp;
}

export interface FSMatchedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  skills: string[];
  job_type: string;
  salary: string;
  apply_link: string;
  match_score: number;
  description: string;
  date_posted: string | null;
  date_scraped: string | null;
}

export interface FSUserProfile {
  resume_skills?: string[];
  skills_updated_at?: Timestamp;
  matched_jobs?: FSMatchedJob[];
  matched_jobs_count?: number;
  matched_jobs_updated_at?: Timestamp | string;
  resume_text?: string;
  api_keys?: { groq?: string };
  preferences?: Record<string, unknown>;
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export interface JobFilters {
  isTech?: boolean;
  jobType?: string;
  isActive?: boolean;
  sortBy?: 'date_scraped' | 'match_score';
  pageSize?: number;
  after?: QueryDocumentSnapshot<DocumentData>;
}

export async function fetchJobs(filters: JobFilters = {}): Promise<{
  jobs: FSJob[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
}> {
  const {
    isTech,
    jobType,
    isActive = true,
    sortBy = 'date_scraped',
    pageSize = 60,
    after,
  } = filters;

  const constraints: QueryConstraint[] = [
    where('is_active', '==', isActive),
  ];

  if (isTech !== undefined) constraints.push(where('is_tech', '==', isTech));
  if (jobType) constraints.push(where('job_type', '==', jobType));

  constraints.push(orderBy(sortBy, 'desc'));
  constraints.push(limit(pageSize));
  if (after) constraints.push(startAfter(after));

  const snap = await getDocs(query(collection(db, 'jobs'), ...constraints));
  const jobs = snap.docs.map(d => d.data() as FSJob);
  const lastDoc = snap.docs[snap.docs.length - 1] ?? null;

  return { jobs, lastDoc };
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function fetchDashboardStats(): Promise<FSDashboardStats | null> {
  const snap = await getDoc(doc(db, 'stats', 'dashboard'));
  return snap.exists() ? (snap.data() as FSDashboardStats) : null;
}

// ─── User profile ─────────────────────────────────────────────────────────────

export async function fetchUserProfile(uid: string): Promise<FSUserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as FSUserProfile) : null;
}

export async function saveGroqApiKey(uid: string, apiKey: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { api_keys: { groq: apiKey } }, { merge: true });
}

export async function clearGroqApiKey(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { 'api_keys.groq': deleteField() });
}

export async function clearResumeSkills(uid: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { resume_skills: [], skills_updated_at: null }, { merge: true });
}

export async function fetchMatchedJobs(uid: string): Promise<FSMatchedJob[]> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return [];
  const data = snap.data() as FSUserProfile;
  return data.matched_jobs ?? [];
}

export async function fetchResumeQueueStatus(uid: string): Promise<{
  status: string;
  skills_count?: number;
  queued_at?: Timestamp;
  processed_at?: Timestamp;
  error?: string;
} | null> {
  const snap = await getDoc(doc(db, 'resume_queue', uid));
  if (!snap.exists()) return null;
  return snap.data() as { status: string; skills_count?: number; queued_at?: Timestamp; processed_at?: Timestamp; error?: string };
}

// ─── Resume upload queue ──────────────────────────────────────────────────────

export async function queueResumeUpload(
  uid: string,
  storagePath: string,
  contentType: string,
): Promise<void> {
  await setDoc(doc(db, 'resume_queue', uid), {
    status: 'pending',
    storage_path: storagePath,
    content_type: contentType,
    queued_at: new Date(),
  });
}

/** Re-trigger job matching from the resume data already stored on users/{uid} (no re-upload). */
export async function queueRecompute(uid: string): Promise<void> {
  await setDoc(doc(db, 'resume_queue', uid), {
    status: 'pending',
    action: 'recompute',
    queued_at: new Date(),
  });
}

// ─── Company background checks ────────────────────────────────────────────────

export type ResearchStatus = 'pending' | 'processing' | 'processed' | 'failed';
export type StageStatus = 'pending' | 'running' | 'done' | 'failed';

export const RESEARCH_STAGES = [
  'validate', 'cache_check', 'collect', 'red_flags', 'synthesize', 'position_analysis',
] as const;
export type ResearchStage = (typeof RESEARCH_STAGES)[number];

export interface FSReportSection {
  text_md: string;
  citations: number[];
  insufficient: boolean;
}

export interface FSRedFlag {
  signal: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  detail: string;
  evidence_url: string;
  source_id: number | null;
}

export interface FSSource {
  id: number;
  url: string;
  title: string;
  domain: string;
  kind: 'website' | 'news' | 'reddit' | 'searxng' | 'whois' | 'github' | 'internal_jobs';
  retrieved_at: Timestamp;
}

export interface FSCompanyReport {
  schema_version: number;
  slug: string;
  company_name_canonical: string;
  aliases: string[];
  status: 'complete';
  generated_at: Timestamp;
  expires_at: Timestamp;
  sections: {
    overview: FSReportSection;
    clients_products: FSReportSection;
    culture_reviews: FSReportSection;
    financial_signals: FSReportSection;
    tech_stack: FSReportSection;
  };
  red_flags: FSRedFlag[];
  review_links: { platform: string; url: string; title: string }[];
  internal_jobs_signal: { active_postings: number; top_skills: string[]; sample_titles: string[] };
  sources: FSSource[];
}

export interface FSResearchRequest {
  id: string;
  uid: string;
  company_name: string;
  position: string;
  jd_text: string;
  consent: boolean;
  status: ResearchStatus;
  created_at: Timestamp;
  company_slug?: string;
  company_report_slug?: string;
  progress?: Partial<Record<ResearchStage, { status: StageStatus; at?: Timestamp }>>;
  position_analysis?: {
    role: string;
    sections: {
      likely_projects: FSReportSection;
      exposure_learning: FSReportSection;
      common_stack: FSReportSection;
      jd_notes?: FSReportSection;
    };
    generated_at: Timestamp;
  };
  error?: string;
  processed_at?: Timestamp;
}

/**
 * Mirror of backend slugify_company() — used only for optimistic "cached report
 * exists" hinting; the backend-computed slug on the request doc is authoritative.
 */
export function slugifyCompany(name: string): string {
  const suffixes = ['pvt', 'ltd', 'limited', 'private', 'inc', 'llc', 'llp', 'corp', 'corporation', 'co', 'plc'];
  let s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
  let words = s.split(/\s+/);
  while (words.length > 1 && suffixes.includes(words[words.length - 1])) {
    words = words.slice(0, -1);
  }
  return words.join('-');
}

export async function submitResearchRequest(
  uid: string,
  input: { companyName: string; position: string; jdText?: string },
): Promise<string> {
  const ref = await addDoc(collection(db, 'research_requests'), {
    uid,
    company_name: input.companyName.trim().slice(0, 120),
    position: input.position.trim().slice(0, 120),
    jd_text: (input.jdText ?? '').slice(0, 15000),
    consent: true,
    status: 'pending',
    created_at: serverTimestamp(),
  });
  return ref.id;
}

export async function fetchResearchRequests(uid: string): Promise<FSResearchRequest[]> {
  const snap = await getDocs(query(
    collection(db, 'research_requests'),
    where('uid', '==', uid),
    orderBy('created_at', 'desc'),
    limit(20),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as FSResearchRequest));
}

export async function fetchResearchRequest(requestId: string): Promise<FSResearchRequest | null> {
  const snap = await getDoc(doc(db, 'research_requests', requestId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as FSResearchRequest) : null;
}

export async function fetchCompanyReport(slug: string): Promise<FSCompanyReport | null> {
  const snap = await getDoc(doc(db, 'company_reports', slug));
  return snap.exists() ? (snap.data() as FSCompanyReport) : null;
}
