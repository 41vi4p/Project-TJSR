'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Download, RefreshCw, Play, AlertCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { logsApi, scraperApi, type LogEntry, type ExtractedJobResult, type ScraperTestResult } from '@/lib/api-client';
import { mockLogs } from '@/lib/mock-data';

const ENGINES = ['auto', 'bs4', 'selenium', 'scrapling', 'crawl4ai', 'newspaper', 'phenom', 'google_careers'];

// ── Scraper Tester ─────────────────────────────────────────────────────────────

function JobCard({ job }: { job: ExtractedJobResult }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-purple-500/20 rounded-lg p-4 bg-slate-800/50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium truncate">{job.title || <span className="text-gray-500 italic">No title extracted</span>}</p>
          <p className="text-gray-400 text-sm">{job.company || '—'} · {job.location || '—'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {job.job_type && (
            <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">{job.job_type}</span>
          )}
          {job.salary && (
            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-300">{job.salary}</span>
          )}
          <button onClick={() => setOpen(o => !o)} className="text-gray-400 hover:text-white">
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          {job.skills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {job.skills.map(s => (
                <span key={s} className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">{s}</span>
              ))}
            </div>
          )}
          {job.apply_link && (
            <p className="text-xs text-gray-500 font-mono truncate">Apply: {job.apply_link}</p>
          )}
          {job.description && (
            <p className="text-xs text-gray-400 whitespace-pre-line line-clamp-4">{job.description}</p>
          )}
        </div>
      )}
    </div>
  );
}

const ORACLE_CONFIG = JSON.stringify({ wait_for: "body", spa_settle_time: 8, scroll: true }, null, 2);
const NVIDIA_CONFIG = JSON.stringify({ max_pages: 18, wait_time: 20 }, null, 2);
const GOOGLE_CONFIG = JSON.stringify({ max_pages: 10, wait_time: 15, detail_delay: 0.5, max_jobs: 100, spa_settle_time: 2 }, null, 2);

function ScraperTester() {
  const [url, setUrl] = useState('https://careers.oracle.com/en/sites/jobsearch/jobs?location=India&locationId=300000000106947');
  const [engine, setEngine] = useState('crawl4ai');
  const [configJson, setConfigJson] = useState('');
  const [configError, setConfigError] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ScraperTestResult | null>(null);
  const [error, setError] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const parsedConfig = (): Record<string, unknown> | undefined => {
    if (!configJson.trim()) return undefined;
    try {
      return JSON.parse(configJson);
    } catch {
      return undefined;
    }
  };

  const onConfigChange = (val: string) => {
    setConfigJson(val);
    if (!val.trim()) { setConfigError(''); return; }
    try { JSON.parse(val); setConfigError(''); } catch { setConfigError('Invalid JSON'); }
  };

  const runTest = async () => {
    if (!url.trim() || configError) return;
    setRunning(true);
    setResult(null);
    setError('');
    try {
      const res = await scraperApi.test(url.trim(), engine, parsedConfig());
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-purple-500/20 rounded-lg p-6 mb-8">
      <h2 className="text-xl font-bold text-white mb-1">Scraper Tester</h2>
      <p className="text-gray-400 text-sm mb-5">
        Test scraping a URL without saving to the database. Use this to diagnose pipeline issues with any source.
      </p>

      {/* URL + Engine row */}
      <div className="flex flex-col md:flex-row gap-3 mb-3">
        <input
          type="url"
          placeholder="https://example.com/careers"
          value={url}
          onChange={e => setUrl(e.target.value)}
          className="flex-1 bg-slate-800 border border-purple-500/20 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
        />
        <select
          value={engine}
          onChange={e => setEngine(e.target.value)}
          className="bg-slate-800 border border-purple-500/20 rounded-lg py-3 px-4 text-white focus:outline-none focus:border-purple-500/50"
        >
          {ENGINES.map(e => (
            <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
          ))}
        </select>
        <button
          onClick={runTest}
          disabled={running || !url.trim() || !!configError}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
        >
          <Play size={16} className={running ? 'animate-pulse' : ''} />
          {running ? 'Running…' : 'Run Test'}
        </button>
      </div>

      {/* Config JSON toggle */}
      <div className="mb-4">
        <button
          onClick={() => setShowConfig(c => !c)}
          className="text-gray-500 hover:text-gray-300 text-xs flex items-center gap-1 mb-2"
        >
          {showConfig ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Extra config (optional JSON — e.g. wait selectors for Selenium/Crawl4AI)
        </button>
        {showConfig && (
          <div>
            <div className="flex gap-2 mb-1 flex-wrap">
              <button
                onClick={() => { onConfigChange(NVIDIA_CONFIG); setEngine('phenom'); setUrl('https://jobs.nvidia.com/careers?start=0&location=India&sort_by=distance&filter_include_remote=1'); }}
                className="text-xs px-2 py-1 rounded bg-slate-700 text-green-300 hover:bg-slate-600"
              >
                Load NVIDIA preset
              </button>
              <button
                onClick={() => { onConfigChange(ORACLE_CONFIG); setEngine('crawl4ai'); setUrl('https://careers.oracle.com/en/sites/jobsearch/jobs?location=India&locationId=300000000106947'); }}
                className="text-xs px-2 py-1 rounded bg-slate-700 text-purple-300 hover:bg-slate-600"
              >
                Load Oracle preset
              </button>
              <button
                onClick={() => { onConfigChange(GOOGLE_CONFIG); setEngine('google_careers'); setUrl('https://www.google.com/about/careers/applications/jobs/results?location=India'); }}
                className="text-xs px-2 py-1 rounded bg-slate-700 text-blue-300 hover:bg-slate-600"
              >
                Load Google preset
              </button>
              <button
                onClick={() => onConfigChange('')}
                className="text-xs px-2 py-1 rounded bg-slate-700 text-gray-400 hover:bg-slate-600"
              >
                Clear
              </button>
            </div>
            <textarea
              rows={4}
              placeholder={'{\n  "wait_for": ".job-list-item",\n  "wait_time": 20,\n  "spa_settle_time": 8\n}'}
              value={configJson}
              onChange={e => onConfigChange(e.target.value)}
              className="w-full bg-slate-800 border border-purple-500/20 rounded-lg py-2 px-3 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-purple-500/50 resize-none"
            />
            {configError && <p className="text-red-400 text-xs mt-1">{configError}</p>}
            <p className="text-gray-600 text-xs mt-1">
              Selenium: <code className="text-gray-400">wait_for</code>, <code className="text-gray-400">wait_time</code>, <code className="text-gray-400">spa_settle_time</code>, <code className="text-gray-400">scroll</code>, <code className="text-gray-400">load_more_selector</code> ·
              Crawl4AI: <code className="text-gray-400">wait_for</code>, <code className="text-gray-400">js_code</code>, <code className="text-gray-400">page_timeout</code>
            </p>
          </div>
        )}
      </div>

      {/* Engine hints */}
      <div className="text-xs text-gray-500 mb-5 p-3 bg-slate-800/40 rounded-lg border border-purple-500/10 space-y-2">
        <div>
          <p className="text-yellow-400 font-medium mb-0.5">NVIDIA / Phenom People Career Sites</p>
          <p>✓ <span className="text-green-300 font-medium">Phenom</span> — dedicated engine: Selenium collects all job URLs across all sidebar pages, then BS4 fetches JSON-LD from each job page. Handles all 173+ jobs automatically.</p>
          <p className="text-gray-600">Config: <code className="text-gray-400">max_pages</code> (default 50), <code className="text-gray-400">wait_time</code> (default 20s)</p>
        </div>
        <div>
          <p className="text-yellow-400 font-medium mb-0.5">Oracle Careers</p>
          <p>✓ <span className="text-purple-300">Crawl4AI</span> or <span className="text-purple-300">Selenium</span> — JS SPA, use <code className="text-gray-400">spa_settle_time: 8</code></p>
        </div>
        <div>
          <p className="text-yellow-400 font-medium mb-0.5">Google Careers</p>
          <p>✓ <span className="text-blue-300">google_careers</span> — dedicated engine: Phase 1 Selenium collects all job URLs across paginated listing, Phase 2 Selenium renders each job detail page for full description extraction.</p>
          <p className="text-gray-600">Config: <code className="text-gray-400">max_pages</code> (default 20), <code className="text-gray-400">max_jobs</code> (default 200), <code className="text-gray-400">wait_time</code> (default 15s), <code className="text-gray-400">detail_delay</code> (default 0.5s)</p>
        </div>
        <div>
          <p>✗ <span className="text-gray-500">BS4 / Scrapling / Newspaper</span> — static only, won't work for JS-rendered listing pages</p>
          <p>✓ <span className="text-blue-300">BS4</span> — works great for individual job URLs that have JSON-LD in initial HTML (e.g. <code className="text-gray-400">/careers/job/123</code>)</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm mb-4">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Engine Used', value: result.engine_used, color: 'text-purple-300' },
              { label: 'Raw Text', value: `${result.raw_text_length.toLocaleString()} chars`, color: 'text-blue-300' },
              { label: 'Links Found', value: result.links_found.toString(), color: 'text-cyan-300' },
              { label: 'Jobs Extracted', value: result.jobs_extracted.length.toString(), color: result.jobs_extracted.length > 0 ? 'text-green-300' : 'text-yellow-300' },
              { label: 'Time', value: `${result.elapsed_seconds}s`, color: 'text-gray-300' },
            ].map(stat => (
              <div key={stat.label} className="bg-slate-800/60 border border-purple-500/10 rounded-lg p-3 text-center">
                <p className="text-gray-500 text-xs mb-1">{stat.label}</p>
                <p className={`font-bold text-sm ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Errors from scraper */}
          {result.errors.length > 0 && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg space-y-1">
              <p className="text-red-300 text-xs font-semibold uppercase tracking-wide mb-1">Scraper Errors</p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-red-200 text-sm font-mono">{e}</p>
              ))}
            </div>
          )}

          {/* Extracted jobs */}
          {result.jobs_extracted.length > 0 ? (
            <div>
              <p className="text-gray-300 text-sm font-medium mb-2 flex items-center gap-2">
                <CheckCircle size={14} className="text-green-400" />
                {result.jobs_extracted.length} job{result.jobs_extracted.length !== 1 ? 's' : ''} extracted by NLP
              </p>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {result.jobs_extracted.map((job, i) => (
                  <JobCard key={i} job={job} />
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-yellow-300 text-sm font-medium">No jobs extracted by NLP</p>
              <p className="text-yellow-200/70 text-xs mt-1">
                {result.raw_text_length === 0
                  ? 'The scraper returned no content. The page may require JavaScript rendering — try Selenium.'
                  : 'Content was fetched but no job patterns were detected. Check the raw text below — the NLP extractor may need tuning for this site.'}
              </p>
            </div>
          )}

          {/* Raw text toggle */}
          {result.raw_text_length > 0 && (
            <div>
              <button
                onClick={() => setShowRaw(r => !r)}
                className="text-gray-400 hover:text-white text-sm flex items-center gap-1 mb-2"
              >
                {showRaw ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showRaw ? 'Hide' : 'Show'} raw text preview ({result.raw_text_length.toLocaleString()} chars total)
              </button>
              {showRaw && (
                <pre className="bg-slate-950 border border-purple-500/10 rounded-lg p-4 text-xs text-gray-300 font-mono whitespace-pre-wrap overflow-auto max-h-64">
                  {result.raw_text_preview}
                  {result.raw_text_length > 3000 && (
                    <span className="text-gray-600">{'\n\n…[truncated, '}{result.raw_text_length - 3000}{' more chars]'}</span>
                  )}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Debug Logs ─────────────────────────────────────────────────────────────────

export default function DebugPage() {
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [useMock, setUseMock] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await logsApi.list({
        level: filter !== 'all' ? filter : undefined,
        limit: 200,
      });
      setLogs(data);
      setUseMock(false);
    } catch {
      setUseMock(true);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const displayLogs = useMock
    ? mockLogs.filter(l => {
        const matchFilter = filter === 'all' || l.type === filter;
        const matchSearch = l.message.toLowerCase().includes(searchTerm.toLowerCase());
        return matchFilter && matchSearch;
      })
    : logs.filter(l => l.message.toLowerCase().includes(searchTerm.toLowerCase()));

  const exportLogs = () => {
    const content = displayLogs.map(l =>
      `[${l.timestamp}] [${l.type.toUpperCase()}] [${l.source}] ${l.message}`
    ).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tjsr-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const logCounts = {
    total: displayLogs.length,
    success: displayLogs.filter(l => l.type === 'success').length,
    error: displayLogs.filter(l => l.type === 'error').length,
    warning: displayLogs.filter(l => l.type === 'warning').length,
  };

  return (
    <div className="max-w-7xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Debug</h1>
          <p className="text-gray-400">Test the scraping pipeline and view system logs</p>
        </div>
        <button
          onClick={loadLogs}
          className="flex items-center space-x-2 px-4 py-2 bg-slate-800 border border-purple-500/20 rounded-lg text-white hover:bg-slate-700 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Scraper Tester */}
      <ScraperTester />

      {/* Log Controls */}
      <div className="bg-slate-900/50 border border-purple-500/20 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          System Logs
          {!useMock && <span className="ml-2 text-purple-400 text-sm font-normal">• Live data</span>}
        </h2>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 border border-purple-500/20 rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-colors"
            />
          </div>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="bg-slate-800 border border-purple-500/20 rounded-lg py-3 px-4 text-white focus:outline-none focus:border-purple-500/50 transition-colors"
          >
            <option value="all">All Logs</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
          </select>
          <button
            onClick={exportLogs}
            className="flex items-center justify-center space-x-2 px-4 py-3 bg-slate-800 border border-purple-500/20 rounded-lg text-white hover:bg-slate-700 transition-colors"
          >
            <Download size={20} />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-900/50 border border-purple-500/20 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-purple-500/10">
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Timestamp</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Type</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Source</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Message</th>
              </tr>
            </thead>
            <tbody>
              {displayLogs.map((log, i) => (
                <tr key={i} className="border-b border-purple-500/10 hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-400 font-mono whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-block px-2 py-1 rounded-md text-xs font-medium ${
                      log.type === 'success' ? 'bg-green-500/20 text-green-300' :
                      log.type === 'error' ? 'bg-red-500/20 text-red-300' :
                      log.type === 'warning' ? 'bg-yellow-500/20 text-yellow-300' :
                      'bg-blue-500/20 text-blue-300'
                    }`}>
                      {log.type.charAt(0).toUpperCase() + log.type.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">{log.source}</td>
                  <td className="px-6 py-4 text-sm text-gray-300">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {displayLogs.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">{loading ? 'Loading logs…' : 'No logs found matching your criteria'}</p>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Logs', value: logCounts.total, color: 'text-blue-400' },
          { label: 'Success', value: logCounts.success, color: 'text-green-400' },
          { label: 'Errors', value: logCounts.error, color: 'text-red-400' },
          { label: 'Warnings', value: logCounts.warning, color: 'text-yellow-400' },
        ].map(stat => (
          <div key={stat.label} className="bg-slate-900/50 border border-purple-500/20 rounded-lg p-4">
            <p className="text-gray-400 text-sm mb-2">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
