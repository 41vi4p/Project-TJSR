'use client';

import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000/api/v1';

/** Wait for Firebase to restore auth state, then return the ID token. */
function getAuthHeaders(): Promise<Record<string, string>> {
  return new Promise(resolve => {
    // If already resolved, use it immediately
    if (auth.currentUser) {
      auth.currentUser.getIdToken()
        .then(token => resolve({ Authorization: `Bearer ${token}` }))
        .catch(() => resolve({}));
      return;
    }
    // Otherwise wait for auth state (fires once on init)
    const unsub = onAuthStateChanged(auth, user => {
      unsub();
      if (!user) { resolve({}); return; }
      user.getIdToken()
        .then(token => resolve({ Authorization: `Bearer ${token}` }))
        .catch(() => resolve({}));
    });
  });
}

async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(options.headers as Record<string, string> || {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T = unknown>(path: string) => apiFetch<T>(path),
  post: <T = unknown>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T = unknown>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T = unknown>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

// ── Typed API calls ─────────────────────────────────────────────────────────────

export interface BackendJob {
  id: string;
  title: string;
  company: string;
  location: string | null;
  description: string | null;
  skills: string[];
  job_type: string | null;
  salary: string | null;
  apply_link: string | null;
  source_url: string | null;
  source_name: string | null;
  is_tech: boolean | null;
  confidence_score: number | null;
  match_score: number;
  date_posted: string | null;
  date_scraped: string;
  created_at: string;
}

export interface JobListResponse {
  jobs: BackendJob[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface DashboardStats {
  total_jobs: number;
  jobs_today: number;
  matched_jobs: number;
  applications_sent: number;
  total_jobs_change: number;
  jobs_today_change: number;
  matched_jobs_change: number;
  applications_change: number;
}

export interface ActivityItem {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface ApplicationResponse {
  id: string;
  user_id: string;
  job_id: string;
  status: string;
  applied_date: string;
  notes: string | null;
  updated_at: string;
  job?: { id: string; title: string; company: string; location: string | null };
}

export interface ApplicationStats {
  total: number;
  applied: number;
  under_review: number;
  interview_scheduled: number;
  rejected: number;
  offer: number;
  accepted: number;
  response_rate: number;
}

export interface ScraperConfig {
  id: string;
  source_type: string;
  source_url: string;
  source_name: string | null;
  enabled: boolean;
  schedule_cron: string | null;
  last_run_at: string | null;
  last_status: string | null;
  scraper_engine: string;
  created_at: string;
}

export interface ExtractedJobResult {
  title: string;
  company: string;
  location: string;
  description: string;
  skills: string[];
  job_type: string;
  salary: string;
  apply_link: string;
}

export interface ScraperTestResult {
  engine_used: string;
  url: string;
  raw_text_preview: string;
  raw_text_length: number;
  links_found: number;
  jobs_extracted: ExtractedJobResult[];
  errors: string[];
  elapsed_seconds: number;
}

export interface ScraperStatus {
  is_running: boolean;
  current_task_id: string | null;
  progress: number;
  jobs_found: number;
  sources_completed: number;
  sources_total: number;
  current_source: string | null;
  errors: string[];
}

export interface BotConfig {
  id: string;
  user_id: string;
  daily_digest_enabled: boolean;
  digest_time: string;
  notification_prefs: Record<string, boolean> | null;
  target_domains: string[] | null;
  telegram_connected: boolean;
  updated_at: string;
}

export interface BotStatus {
  connected: boolean;
  telegram_chat_id: number | null;
  bot_username: string | null;
  daily_digest_enabled: boolean;
  last_digest_sent: string | null;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  source: string;
  metadata: Record<string, unknown> | null;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: Record<string, number>;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
  color: string | null;
  size: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  properties: Record<string, unknown>;
}

export interface ChatResponse {
  message: string;
  sources: { job_id: string; title: string; company: string; relevance_score: number }[];
  session_id: string;
}

// Convenience helpers
export const jobsApi = {
  list: (params?: Record<string, string | number | boolean>) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ).toString() : '';
    return api.get<JobListResponse>(`/jobs${qs}`);
  },
  get: (id: string) => api.get<BackendJob>(`/jobs/${id}`),
};

export const statsApi = {
  dashboard: () => api.get<DashboardStats>('/stats/dashboard'),
  activity: (limit = 20) => api.get<ActivityItem[]>(`/stats/activity?limit=${limit}`),
};

export const applicationsApi = {
  list: () => api.get<ApplicationResponse[]>('/applications'),
  stats: () => api.get<ApplicationStats>('/applications/stats'),
  create: (data: { job_id: string; status?: string; notes?: string }) =>
    api.post<ApplicationResponse>('/applications', data),
  update: (id: string, data: { status?: string; notes?: string }) =>
    api.put<ApplicationResponse>(`/applications/${id}`, data),
  remove: (id: string) => api.delete(`/applications/${id}`),
};

export interface SyncRunResult {
  jobs_found: number;
  sources_completed: number;
  sources_total: number;
  errors: string[];
}

export const scraperApi = {
  getConfigs: () => api.get<ScraperConfig[]>('/scraper/configs'),
  createConfig: (data: Partial<ScraperConfig> & { source_url: string; source_type: string }) =>
    api.post<ScraperConfig>('/scraper/configs', data),
  updateConfig: (id: string, data: Partial<ScraperConfig>) =>
    api.put<ScraperConfig>(`/scraper/configs/${id}`, data),
  deleteConfig: (id: string) => api.delete(`/scraper/configs/${id}`),
  run: (configIds?: string[]) => api.post('/scraper/run', { config_ids: configIds }),
  runSync: (configIds?: string[]) => api.post<SyncRunResult>('/scraper/run/sync', { config_ids: configIds }),
  discover: () => api.post<SyncRunResult>('/scraper/discover', {}),
  stop: () => api.post('/scraper/stop', {}),
  status: () => api.get<ScraperStatus>('/scraper/status'),
  test: (url: string, engine: string, config_json?: Record<string, unknown>) =>
    api.post<ScraperTestResult>('/scraper/test', { url, engine, config_json }),
};

export const botApi = {
  getConfig: () => api.get<BotConfig>('/bot/config'),
  updateConfig: (data: Partial<BotConfig> & { email_list?: string[] }) => api.put<BotConfig>('/bot/config', data),
  getStatus: () => api.get<BotStatus>('/bot/status'),
  connect: (link_code: string) => api.post('/bot/connect', { link_code }),
  disconnect: () => api.post('/bot/disconnect', {}),
  sendEmailDigest: () => api.post<{ sent: number; total?: number; message?: string; errors?: string[]; preview?: any[] }>('/bot/send-email-digest', {}),
};

export const logsApi = {
  list: (params?: { level?: string; source?: string; limit?: number }) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    ).toString() : '';
    return api.get<LogEntry[]>(`/logs${qs}`);
  },
};

export const graphApi = {
  getData: (params?: { company?: string; skill?: string; limit?: number }) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    ).toString() : '';
    return api.get<GraphData>(`/graph/data${qs}`);
  },
};

export const chatApi = {
  send: (message: string, session_id?: string) =>
    api.post<ChatResponse>('/chat', { message, session_id }),
  history: (session_id: string) =>
    api.get<{ role: string; content: string; timestamp: string }[]>(`/chat/history?session_id=${session_id}`),
  clearHistory: () => api.delete('/chat/history'),
};

// Streaming helper for chat
export async function* streamChat(
  message: string,
  session_id: string,
  signal?: AbortSignal
) {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ message, session_id }),
    signal,
  });

  if (!res.ok) throw new Error('Stream failed');

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    for (const line of chunk.split('\n')) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          yield JSON.parse(data);
        } catch {
          // ignore malformed lines
        }
      }
    }
  }
}
