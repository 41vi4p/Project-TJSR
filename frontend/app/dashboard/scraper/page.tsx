'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { StatCard } from '@/components/dashboard/stat-card';
import {
  Zap, Play, Square, RefreshCw, Server, Plus, Trash2,
  Loader2, CheckCircle, AlertCircle, AlertTriangle, Info,
} from 'lucide-react';
import {
  scraperApi, logsApi,
  type ScraperConfig, type ScraperStatus, type SyncRunResult, type LogEntry,
} from '@/lib/api-client';

const ENGINE_LABELS: Record<string, string> = {
  auto: 'Auto',
  bs4: 'BS4 (static)',
  phenom: 'Phenom (NVIDIA)',
  selenium: 'Selenium (JS)',
  crawl4ai: 'Crawl4AI',
  scrapling: 'Scrapling',
  newspaper: 'Newspaper',
  google_careers: 'Google Careers',
  playwright: 'Playwright (JS)',
  rss: 'RSS/Atom Feed',
  sitemap: 'Sitemap Discovery',
};

// ── Result Banner ──────────────────────────────────────────────────────────────

function RunResultBanner({ result, onDismiss }: { result: SyncRunResult; onDismiss: () => void }) {
  const hasErrors = result.errors.length > 0;
  const noJobs = result.jobs_found === 0;

  return (
    <div className={`rounded-lg border p-4 mb-6 ${
      hasErrors ? 'bg-red-500/10 border-red-500/30' :
      noJobs ? 'bg-yellow-500/10 border-yellow-500/30' :
      'bg-green-500/10 border-green-500/30'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {hasErrors ? <AlertCircle size={18} className="text-red-400 mt-0.5 shrink-0" /> :
           noJobs ? <AlertTriangle size={18} className="text-yellow-400 mt-0.5 shrink-0" /> :
           <CheckCircle size={18} className="text-green-400 mt-0.5 shrink-0" />}
          <div>
            <p className={`font-medium text-sm ${hasErrors ? 'text-red-300' : noJobs ? 'text-yellow-300' : 'text-green-300'}`}>
              {hasErrors ? 'Scraper finished with errors' :
               noJobs ? 'Scraper finished — 0 jobs found' :
               `Scraper finished — ${result.jobs_found} jobs saved`}
            </p>
            <p className="text-xs theme-muted mt-0.5">
              {result.sources_completed}/{result.sources_total} sources processed
            </p>

            {/* Diagnosis for 0 jobs */}
            {noJobs && !hasErrors && (
              <div className="mt-2 text-xs text-yellow-200/70 space-y-0.5">
                <p>Possible causes:</p>
                <p>· Source uses a JavaScript SPA — try <strong>Phenom</strong>, <strong>Selenium</strong>, or <strong>Crawl4AI</strong> engine</p>
                <p>· No matching jobs at the URL (check filters)</p>
                <p>· Use <strong>Debug Logs → Scraper Tester</strong> to diagnose the URL directly</p>
              </div>
            )}

            {/* Errors list */}
            {hasErrors && (
              <ul className="mt-2 space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-xs text-red-300 font-mono">{e}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <button onClick={onDismiss} className="text-gray-500 hover:text-[var(--text-main)] text-xs shrink-0">✕</button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ScraperPage() {
  const [status, setStatus] = useState<ScraperStatus>({
    is_running: false, current_task_id: null, progress: 0,
    jobs_found: 0, sources_completed: 0, sources_total: 0,
    current_source: null, errors: [],
  });
  const [configs, setConfigs] = useState<ScraperConfig[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [lastResult, setLastResult] = useState<SyncRunResult | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [newEngine, setNewEngine] = useState('auto');
  const [newConfigJson, setNewConfigJson] = useState('');
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadConfigs = useCallback(async () => {
    try {
      const data = await scraperApi.getConfigs();
      setConfigs(data);
    } catch { /* backend offline */ }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const data = await logsApi.list({ source: 'Scraper', limit: 30 });
      setLogs(data);
    } catch { /* ignore */ }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const data = await scraperApi.status();
      setStatus(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadConfigs();
    loadLogs();
    loadStatus();
    statusIntervalRef.current = setInterval(loadStatus, 5000);
    return () => { if (statusIntervalRef.current) clearInterval(statusIntervalRef.current); };
  }, [loadConfigs, loadLogs, loadStatus]);

  const handleRun = async () => {
    if (running) return;
    setRunning(true);
    setLastResult(null);
    try {
      const result = await scraperApi.runSync();
      setLastResult(result);
      await Promise.all([loadConfigs(), loadLogs(), loadStatus()]);
    } catch (e: unknown) {
      setLastResult({
        jobs_found: 0,
        sources_completed: 0,
        sources_total: 0,
        errors: [e instanceof Error ? e.message : 'Run failed'],
      });
    } finally {
      setRunning(false);
    }
  };

  const handleDiscover = async () => {
    if (discovering) return;
    setDiscovering(true);
    setLastResult(null);
    try {
      const result = await scraperApi.discover();
      setLastResult(result);
      await Promise.all([loadLogs(), loadStatus()]);
    } catch (e: unknown) {
      setLastResult({
        jobs_found: 0, sources_completed: 0, sources_total: 0,
        errors: [e instanceof Error ? e.message : 'Discovery failed'],
      });
    } finally {
      setDiscovering(false);
    }
  };

  const handleAddSource = async () => {
    if (!newUrl) return;
    try {
      let parsedConfig: Record<string, unknown> | undefined;
      if (newConfigJson.trim()) {
        try { parsedConfig = JSON.parse(newConfigJson); } catch { /* ignore bad JSON */ }
      }
      // Auto-set engine when adding a Google Careers URL
      const engineToUse = newEngine === 'auto' && newUrl.includes('google.com/about/careers')
        ? 'google_careers'
        : newEngine;
      const config = await scraperApi.createConfig({
        source_url: newUrl,
        source_type: 'custom_url',
        source_name: newName || newUrl,
        scraper_engine: engineToUse,
        config_json: parsedConfig,
      });
      setConfigs(prev => [config, ...prev]);
      setNewUrl('');
      setNewName('');
      setNewEngine('auto');
      setNewConfigJson('');
      setShowAddForm(false);
      await loadLogs();
    } catch { /* ignore */ }
  };

  const handleDeleteConfig = async (id: string) => {
    try {
      await scraperApi.deleteConfig(id);
      setConfigs(prev => prev.filter(c => c.id !== id));
    } catch { /* ignore */ }
  };

  const handleToggleConfig = async (config: ScraperConfig) => {
    try {
      const updated = await scraperApi.updateConfig(config.id, { enabled: !config.enabled });
      setConfigs(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch { /* ignore */ }
  };

  const totalJobsEver = configs.reduce((_, __) => 0, 0); // placeholder
  const lastRunAt = configs
    .filter(c => c.last_run_at)
    .sort((a, b) => new Date(b.last_run_at!).getTime() - new Date(a.last_run_at!).getTime())[0]?.last_run_at;

  const lastRunLabel = lastRunAt
    ? (() => {
        const diff = Math.round((Date.now() - new Date(lastRunAt).getTime()) / 60000);
        return diff < 1 ? 'Just now' : diff < 60 ? `${diff}m ago` : `${Math.round(diff / 60)}h ago`;
      })()
    : 'Never';

  return (
    <div className="max-w-7xl">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold theme-text mb-2">Scraper Control</h1>
          <p className="text-gray-400">Monitor and control your job scraper</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDiscover}
            disabled={discovering}
            title="Auto-discover jobs from public job APIs (RemoteOK, Arbeitnow, The Muse) — no URL needed"
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold border theme-border theme-text hover:bg-yellow-400/10 transition-all disabled:opacity-50"
          >
            {discovering ? <Loader2 size={18} className="animate-spin" /> : <Server size={18} />}
            <span>{discovering ? 'Discovering…' : 'Discover Jobs'}</span>
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2 bg-[#FACC15] text-[#1F2937] rounded-lg font-semibold hover:shadow-lg transition-all"
          >
            <Plus size={18} />
            <span>Add Source</span>
          </button>
        </div>
      </div>

      {/* Add Source Form */}
      {showAddForm && (
        <div className="[background:var(--card-bg)]/50 border theme-border rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold theme-text mb-4">Add New Data Source</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="url"
              placeholder="https://company.com/careers"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              className="theme-surface border theme-border rounded-lg py-2 px-3 theme-text placeholder:text-[var(--text-muted)] focus:outline-none focus:theme-border"
            />
            <input
              type="text"
              placeholder="Source name (optional)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="theme-surface border theme-border rounded-lg py-2 px-3 theme-text placeholder:text-[var(--text-muted)] focus:outline-none focus:theme-border"
            />
            <select
              value={newEngine}
              onChange={e => {
                setNewEngine(e.target.value);
                if (e.target.value === 'google_careers' && !newConfigJson.trim()) {
                  setNewConfigJson(JSON.stringify({ max_pages: 10, wait_time: 15, max_jobs: 100, detail_delay: 0.5 }, null, 2));
                }
                if (e.target.value === 'phenom' && !newConfigJson.trim()) {
                  setNewConfigJson(JSON.stringify({ max_pages: 18, wait_time: 20 }, null, 2));
                }
              }}
              className="theme-surface border theme-border rounded-lg py-2 px-3 theme-text focus:outline-none focus:theme-border"
            >
              <option value="auto">Auto (recommended)</option>
              <option value="bs4">BS4 — static / JSON-LD sites</option>
              <option value="playwright">Playwright — JS SPAs (best stealth)</option>
              <option value="phenom">Phenom People — NVIDIA, Comcast, etc.</option>
              <option value="google_careers">Google Careers — google.com/about/careers</option>
              <option value="selenium">Selenium — JavaScript SPAs</option>
              <option value="crawl4ai">Crawl4AI — JS + AI extraction</option>
              <option value="scrapling">Scrapling</option>
              <option value="rss">RSS/Atom Feed — job feed URLs</option>
              <option value="sitemap">Sitemap Discovery — auto-find job URLs</option>
            </select>
          </div>
          <div className="mt-3">
            <label className="text-xs theme-muted mb-1 block">Engine config (JSON, optional)</label>
            <textarea
              rows={3}
              placeholder='{ "max_pages": 10, "wait_time": 15 }'
              value={newConfigJson}
              onChange={e => setNewConfigJson(e.target.value)}
              className="w-full theme-surface border theme-border rounded-lg py-2 px-3 text-sm theme-text font-mono placeholder-gray-600 focus:outline-none focus:theme-border resize-none"
            />
          </div>
          <div className="mt-3 p-3 theme-input rounded-lg text-xs theme-muted space-y-0.5">
            <p><span className="text-yellow-400">Tip — NVIDIA jobs.nvidia.com:</span> use <strong className="text-white">Phenom People</strong> engine</p>
            <p><span className="text-yellow-400">Tip — Oracle careers.oracle.com:</span> use <strong className="text-white">Crawl4AI</strong> or <strong className="text-white">Selenium</strong></p>
            <p><span className="text-blue-300">Tip — Google Careers:</span> use <strong className="text-white">Google Careers</strong> engine — add URL like <code className="text-gray-400">google.com/about/careers/applications/jobs/results?location=India</code></p>
            <p><span className="text-yellow-400">Tip — individual job URLs:</span> <strong className="text-white">BS4</strong> works great when the page has JSON-LD</p>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleAddSource} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg theme-text text-sm transition-colors">
              Add Source
            </button>
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 border theme-border rounded-lg theme-muted hover:text-[var(--text-main)] text-sm transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label="Scraper Status" value={running ? 'Running' : 'Idle'} icon={<Server size={24} className={running ? 'text-green-400' : 'text-gray-400'} />} />
        <StatCard label="Sources" value={`${configs.filter(c => c.enabled).length} active`} icon={<Zap size={24} />} />
        <StatCard label="Last Run" value={lastRunLabel} icon={<RefreshCw size={24} />} />
      </div>

      {/* Result Banner */}
      {lastResult && <RunResultBanner result={lastResult} onDismiss={() => setLastResult(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Control Panel */}
        <div className="lg:col-span-2 brand-card dark-card rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold theme-text">Data Sources</h2>
            <span className="text-gray-400 text-sm">{configs.length} configured</span>
          </div>

          {/* Live progress (when running) */}
          {running && (
            <div className="mb-6 p-4 theme-surface rounded-lg border theme-border">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 size={16} className="animate-spin text-yellow-500" />
                <span className="text-sm text-yellow-400 font-medium">
                  {status.current_source
                    ? `Scraping: ${status.current_source}`
                    : status.sources_total > 0
                      ? `Processing ${status.sources_total} source(s)…`
                      : 'Connecting to scraper…'}
                </span>
              </div>
              {status.sources_total > 0 && (
                <>
                  <div className="[background:var(--card-bg2)] rounded-full h-1.5 mb-1">
                    <div className="bg-[#FACC15] h-1.5 rounded-full transition-all" style={{ width: `${status.progress}%` }} />
                  </div>
                  <p className="text-xs theme-muted">{status.progress}% — {status.sources_completed}/{status.sources_total} sources — {status.jobs_found} jobs found</p>
                </>
              )}
            </div>
          )}

          {/* Sources list */}
          {configs.length === 0 ? (
            <div className="text-center py-12 theme-muted">
              <Server size={32} className="mx-auto mb-3 opacity-30" />
              <p className="mb-1">No sources configured</p>
              <p className="text-sm">Click <strong className="text-gray-300">+ Add Source</strong> to add a career page URL</p>
            </div>
          ) : (
            <div className="space-y-3 mb-6">
              {configs.map(config => (
                <div key={config.id} className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                  config.enabled ? 'theme-input theme-border' : '[background:var(--card-bg2)] border-slate-700/30 opacity-60'
                }`}>
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-gray-200 text-sm font-medium truncate">{config.source_name || config.source_url}</p>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-400/15 text-yellow-400 shrink-0">
                        {ENGINE_LABELS[config.scraper_engine] || config.scraper_engine}
                      </span>
                      {config.last_status && (
                        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                          config.last_status === 'success' ? 'bg-green-500/20 text-green-400' :
                          config.last_status === 'failed' ? 'bg-red-500/20 text-red-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>{config.last_status}</span>
                      )}
                      {/* Warn about wrong engine for known JS sites */}
                      {(config.scraper_engine === 'auto' || config.scraper_engine === 'bs4') &&
                       (config.source_url.includes('nvidia') || config.source_url.includes('oracle') || config.source_url.includes('workday')) && (
                        <span className="text-xs text-yellow-400 flex items-center gap-1 shrink-0">
                          <AlertTriangle size={11} /> JS site — consider changing engine
                        </span>
                      )}
                      {config.source_url.includes('google.com/about/careers') && config.scraper_engine !== 'google_careers' && (
                        <span className="text-xs text-blue-400 flex items-center gap-1 shrink-0">
                          <AlertTriangle size={11} /> Use Google Careers engine
                        </span>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs mt-0.5 truncate">{config.source_url}</p>
                    <p className="text-gray-600 text-xs">
                      {config.last_run_at ? `Last run: ${new Date(config.last_run_at).toLocaleString()}` : 'Never run'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={config.enabled} onChange={() => handleToggleConfig(config)} />
                      <div className="w-11 h-6 [background:var(--card-bg2)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-400"></div>
                    </label>
                    <button onClick={() => handleDeleteConfig(config.id)} className="text-gray-500 hover:text-red-400 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Run button */}
          <div className="flex gap-4">
            <button
              onClick={handleRun}
              disabled={running || configs.filter(c => c.enabled).length === 0}
              className="flex-1 flex items-center justify-center gap-2 bg-[#FACC15] text-[#1F2937] rounded-lg py-3 theme-text font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {running
                ? <><Loader2 size={20} className="animate-spin" /> Running… (this may take a few minutes)</>
                : <><Play size={20} /> Run Scraper</>}
            </button>
            <button
              onClick={() => { loadConfigs(); loadLogs(); loadStatus(); }}
              className="flex items-center gap-2 border theme-border rounded-lg py-3 px-6 theme-text font-semibold hover:bg-yellow-400/10 transition-colors"
            >
              <RefreshCw size={20} />
              <span>Refresh</span>
            </button>
          </div>

          {configs.filter(c => c.enabled).length === 0 && configs.length > 0 && (
            <p className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
              <AlertTriangle size={12} /> All sources are disabled. Enable at least one to run.
            </p>
          )}
        </div>

        {/* Activity Feed (from backend logs) */}
        <div className="brand-card dark-card rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold theme-text">Activity Feed</h2>
            <button onClick={loadLogs} className="text-gray-500 hover:text-gray-300 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
            {logs.length === 0 && (
              <p className="text-gray-500 text-sm">No scraper activity yet.</p>
            )}
            {logs.map(log => (
              <div key={log.id} className="flex items-start gap-2 pb-3 border-b theme-border last:border-0">
                <div className="mt-1 shrink-0">
                  {log.type === 'success' ? <CheckCircle size={13} className="text-green-400" /> :
                   log.type === 'error' ? <AlertCircle size={13} className="text-red-400" /> :
                   log.type === 'warning' ? <AlertTriangle size={13} className="text-yellow-400" /> :
                   <Info size={13} className="text-blue-400" />}
                </div>
                <div className="min-w-0">
                  <p className="text-gray-300 text-xs leading-snug">{log.message}</p>
                  <p className="text-gray-600 text-xs mt-0.5">{new Date(log.timestamp).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
