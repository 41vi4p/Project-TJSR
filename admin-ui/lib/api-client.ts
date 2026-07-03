'use client';

import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

const BACKEND_URL = 'http://localhost:8000/api/v1';

function getAuthHeaders(): Promise<Record<string, string>> {
  return new Promise(resolve => {
    if (auth.currentUser) {
      auth.currentUser.getIdToken()
        .then(token => resolve({ Authorization: `Bearer ${token}` }))
        .catch(() => resolve({}));
      return;
    }
    const unsub = onAuthStateChanged(auth, user => {
      unsub();
      if (!user) { resolve({}); return; }
      user.getIdToken()
        .then(token => resolve({ Authorization: `Bearer ${token}` }))
        .catch(() => resolve({}));
    });
  });
}

async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
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

const api = {
  get: <T = unknown>(path: string) => apiFetch<T>(path),
  post: <T = unknown>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T = unknown>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T = unknown>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScraperConfig {
  id: string;
  source_url: string;
  source_type: string;
  source_name: string;
  scraper_engine: string;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  config_json: Record<string, unknown> | null;
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

export interface SyncRunResult {
  jobs_found: number;
  sources_completed: number;
  sources_total: number;
  errors: string[];
}

export interface LogEntry {
  id: string;
  type: 'info' | 'success' | 'error' | 'warning';
  source: string;
  message: string;
  timestamp: string;
}

export interface BotConfig {
  daily_digest_enabled: boolean;
  digest_time: string;
}

export interface BotStatus {
  connected: boolean;
  telegram_chat_id: string | null;
  bot_username: string | null;
}

export interface ExtractedJobResult {
  title: string;
  company: string;
  location: string;
  job_type: string;
  salary: string;
  skills: string[];
  apply_link: string;
  description: string;
}

export interface ScraperTestResult {
  engine_used: string;
  raw_text_length: number;
  raw_text_preview: string;
  links_found: number;
  jobs_extracted: ExtractedJobResult[];
  errors: string[];
  elapsed_seconds: number;
}

// ── API namespaces ────────────────────────────────────────────────────────────

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
  sendEmailDigest: () => api.post<{ sent: number; total?: number; message?: string; errors?: string[] }>('/bot/send-email-digest', {}),
};

export const logsApi = {
  list: (params?: { level?: string; source?: string; limit?: number }) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        ).toString()
      : '';
    return api.get<LogEntry[]>(`/logs${qs}`);
  },
};

export const firebaseAdminApi = {
  syncStats: () => api.post('/firebase/sync/stats', {}),
  bulkSyncJobs: () => api.post('/firebase/sync/bulk-jobs', {}),
};
