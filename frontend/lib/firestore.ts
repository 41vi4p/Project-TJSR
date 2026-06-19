import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteField,
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

export interface FSGraphSnapshot {
  nodes: { id: string; label: string; type: string; color: string; size: number; properties: Record<string, unknown> }[];
  edges: { source: string; target: string; label: string }[];
  stats: Record<string, number>;
  last_updated: Timestamp;
}

export interface FSUserProfile {
  resume_skills?: string[];
  skills_updated_at?: Timestamp;
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

// ─── Graph ────────────────────────────────────────────────────────────────────

export async function fetchGraphSnapshot(): Promise<FSGraphSnapshot | null> {
  const snap = await getDoc(doc(db, 'graph', 'snapshot'));
  return snap.exists() ? (snap.data() as FSGraphSnapshot) : null;
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
