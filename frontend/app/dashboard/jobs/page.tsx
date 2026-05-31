'use client';

import { useState, useEffect, useCallback } from 'react';
import { JobCard } from '@/components/dashboard/job-card';
import {
  Search, Loader2, X, MapPin, Briefcase, Clock,
  ExternalLink, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { jobsApi, type BackendJob } from '@/lib/api-client';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function toFrontendJob(j: BackendJob) {
  return {
    id: j.id,
    title: j.title,
    company: j.company,
    location: j.location || 'Remote',
    skills: j.skills || [],
    jobType: (j.job_type as 'Full-time' | 'Part-time' | 'Contract' | 'Internship') || 'Full-time',
    salary: j.salary || undefined,
    applyLink: j.apply_link || '#',
    datePosted: j.date_posted ? timeAgo(j.date_posted) : timeAgo(j.date_scraped),
    matchScore: j.match_score || 0,
    description: j.description || '',
    sourceName: j.source_name || '',
    sourceUrl: j.source_url || '',
  };
}

type FrontendJob = ReturnType<typeof toFrontendJob>;

// ── Job Detail Modal ───────────────────────────────────────────────────────────

function JobDetailModal({ job, onClose }: { job: FrontendJob; onClose: () => void }) {
  const hasApplyLink = job.applyLink && job.applyLink !== '#';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel — full-screen sheet on mobile, centered modal on sm+ */}
      <div className="relative brand-card dark-card w-full sm:rounded-xl sm:max-w-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col shadow-2xl rounded-t-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-6 border-b theme-border">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="text-lg sm:text-xl font-bold theme-text mb-1 leading-tight">{job.title}</h2>
            <p className="text-yellow-400 font-medium text-sm sm:text-base">{job.company}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-[var(--text-main)] transition-colors shrink-0 mt-1">
            <X size={20} />
          </button>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-2 sm:gap-4 px-4 sm:px-6 py-3 border-b theme-border text-xs sm:text-sm theme-muted">
          <span className="flex items-center gap-1.5"><MapPin size={13} />{job.location}</span>
          <span className="flex items-center gap-1.5"><Briefcase size={13} />{job.jobType}</span>
          <span className="flex items-center gap-1.5"><Clock size={13} />{job.datePosted}</span>
          {job.salary && <span className="text-yellow-500 font-medium">{job.salary}</span>}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Skills */}
          {job.skills.length > 0 && (
            <div>
              <p className="text-xs font-semibold theme-muted uppercase tracking-wide mb-2">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {job.skills.map(s => (
                  <span key={s} className="px-2 py-1 rounded-md bg-yellow-400/15 text-yellow-400 text-xs font-medium">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {job.description && (
            <div>
              <p className="text-xs font-semibold theme-muted uppercase tracking-wide mb-2">Description</p>
              <p className="theme-text text-sm whitespace-pre-line leading-relaxed break-words">{job.description}</p>
            </div>
          )}

          {/* Source */}
          {job.sourceName && (
            <div className="pt-2 border-t theme-border">
              <p className="text-xs theme-muted">
                Source: <span>{job.sourceName}</span>
                {job.sourceUrl && job.sourceUrl !== '#' && (
                  <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="ml-2 text-yellow-500 hover:text-yellow-400 underline break-all">
                    View original
                  </a>
                )}
              </p>
            </div>
          )}

          {!job.description && !job.skills.length && (
            <div className="text-center py-8 theme-muted text-sm">
              <p>No detailed information available for this job.</p>
              <p className="mt-1">The scraper may not have extracted the full description yet.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t theme-border flex flex-col sm:flex-row gap-3">
          {hasApplyLink ? (
            <a
              href={job.applyLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 bg-[#FACC15] text-[#1F2937] rounded-lg py-3 theme-text font-semibold hover:shadow-lg transition-all"
            >
              <ExternalLink size={16} />
              Apply Now
            </a>
          ) : (
            <div className="flex-1 px-4 py-3 rounded-lg theme-surface theme-muted text-sm text-center">
              No apply link available — search for this job directly on the company website
            </div>
          )}
          <button
            onClick={onClose}
            className="sm:w-auto px-6 py-3 border theme-border rounded-lg theme-text-soft hover:text-[var(--text-main)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Location Quick Picks ──────────────────────────────────────────────────────

const LOCATION_PICKS = ['India', 'Remote', 'Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'United States', 'United Kingdom', 'Singapore'];
const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship'];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [locationInput, setLocationInput] = useState('');
  const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState('date_scraped');
  const [isTechOnly, setIsTechOnly] = useState<boolean | undefined>(undefined);
  const [includeExpired, setIncludeExpired] = useState(false);
  const [jobs, setJobs] = useState<FrontendJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selectedJob, setSelectedJob] = useState<FrontendJob | null>(null);

  const fetchJobs = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string | number | boolean> = {
        page: p,
        page_size: 12,
        sort_by: sortBy === 'match_score' ? 'match_score' : 'date_scraped',
        sort_order: 'desc',
      };
      if (searchTerm) params.search = searchTerm;
      if (selectedLocations.length) params.locations = selectedLocations.join(',');
      if (selectedJobTypes.length) params.job_types = selectedJobTypes.join(',');
      if (isTechOnly !== undefined) params.is_tech = isTechOnly;
      if (includeExpired) params.include_expired = true;

      const data = await jobsApi.list(params);
      setJobs(data.jobs.map(toFrontendJob));
      setTotal(data.total);
      setPage(data.page);
      setTotalPages(data.total_pages);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedLocations, selectedJobTypes, sortBy, isTechOnly, includeExpired]);

  useEffect(() => {
    const t = setTimeout(() => fetchJobs(1), 300);
    return () => clearTimeout(t);
  }, [fetchJobs]);

  const toggleLocation = (loc: string) =>
    setSelectedLocations(prev => prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc]);

  const addCustomLocation = () => {
    const v = locationInput.trim();
    if (v && !selectedLocations.includes(v)) setSelectedLocations(prev => [...prev, v]);
    setLocationInput('');
  };

  const toggleJobType = (type: string) =>
    setSelectedJobTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);

  const clearAllFilters = () => {
    setSearchTerm('');
    setSelectedLocations([]);
    setLocationInput('');
    setSelectedJobTypes([]);
    setIsTechOnly(undefined);
    setIncludeExpired(false);
  };

  const activeFilterCount = selectedLocations.length + selectedJobTypes.length + (isTechOnly !== undefined ? 1 : 0) + (includeExpired ? 1 : 0);

  return (
    <div className="max-w-7xl">
      {selectedJob && <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />}

      <div className="mb-8">
        <h1 className="text-4xl font-bold theme-text mb-2">Job Listings</h1>
        <p className="text-gray-400">
          Discover and apply to jobs matched with your profile
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Filters */}
        <div className="lg:col-span-1 space-y-4">
          <div className="brand-card dark-card rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold theme-text">Filters</h3>
              {activeFilterCount > 0 && (
                <button onClick={clearAllFilters} className="text-xs text-yellow-500 hover:text-yellow-400 transition-colors">
                  Clear all ({activeFilterCount})
                </button>
              )}
            </div>

            {/* Location — multi-select */}
            <div className="mb-5">
              <p className="text-xs font-semibold theme-muted uppercase tracking-wide mb-2">Location</p>
              <div className="flex gap-1.5 mb-2">
                <input
                  type="text"
                  placeholder="Add location…"
                  value={locationInput}
                  onChange={e => setLocationInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomLocation(); }}
                  className="flex-1 theme-surface border theme-border rounded-lg py-1.5 px-3 theme-text text-xs placeholder:text-[var(--text-muted)] focus:outline-none"
                />
                {locationInput && (
                  <button onClick={addCustomLocation}
                    className="px-2.5 py-1.5 rounded-lg bg-yellow-400/20 text-yellow-500 text-xs font-medium hover:bg-yellow-400/30 transition-colors">
                    +
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {LOCATION_PICKS.map(loc => (
                  <button key={loc} onClick={() => toggleLocation(loc)}
                    className={`text-xs px-2 py-1 rounded-md transition-colors ${
                      selectedLocations.includes(loc)
                        ? 'bg-yellow-400/25 text-yellow-500 border border-yellow-400/40'
                        : 'theme-surface theme-muted hover:text-[var(--text-main)]'
                    }`}>
                    {loc}
                  </button>
                ))}
              </div>
              {/* Custom added locations */}
              {selectedLocations.filter(l => !LOCATION_PICKS.includes(l)).map(loc => (
                <span key={loc} className="inline-flex items-center gap-1 mt-1.5 text-xs px-2 py-1 rounded-md bg-yellow-400/25 text-yellow-500 border border-yellow-400/40">
                  {loc}
                  <button onClick={() => setSelectedLocations(prev => prev.filter(l => l !== loc))} className="hover:text-red-400">×</button>
                </span>
              ))}
            </div>

            {/* Job Type — multi-select */}
            <div className="mb-5">
              <p className="text-xs font-semibold theme-muted uppercase tracking-wide mb-2">Job Type</p>
              <div className="flex flex-wrap gap-1.5">
                {JOB_TYPES.map(type => (
                  <button key={type} onClick={() => toggleJobType(type)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                      selectedJobTypes.includes(type)
                        ? 'bg-yellow-400/25 text-yellow-500 border border-yellow-400/40'
                        : 'theme-surface theme-muted hover:text-[var(--text-main)]'
                    }`}>
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div className="mb-5">
              <p className="text-xs font-semibold theme-muted uppercase tracking-wide mb-2">Category</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'All', value: undefined },
                  { label: 'Tech', value: true },
                  { label: 'Non-Tech', value: false },
                ].map(({ label, value }) => (
                  <button key={label} onClick={() => setIsTechOnly(value)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                      isTechOnly === value
                        ? 'bg-yellow-400/20 theme-text border theme-border'
                        : 'text-gray-400 hover:text-[var(--text-main)] hover:theme-surface'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Expired */}
            <div>
              <p className="text-xs font-semibold theme-muted uppercase tracking-wide mb-2">Freshness</p>
              <button onClick={() => setIncludeExpired(v => !v)}
                className={`w-full text-left text-xs px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                  includeExpired
                    ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                    : 'theme-surface theme-muted hover:text-[var(--text-main)]'
                }`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${includeExpired ? 'bg-red-400' : 'bg-green-400'}`} />
                {includeExpired ? 'Showing expired (>30 days)' : 'Active only (<30 days)'}
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {/* Search + Sort */}
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 theme-muted" size={20} />
              <input
                type="text"
                placeholder="Search jobs, companies…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full brand-card dark-card rounded-lg py-3 pl-10 pr-4 theme-text placeholder:text-[var(--text-muted)] focus:outline-none focus:theme-border transition-colors"
              />
            </div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="brand-card dark-card rounded-lg py-3 px-4 theme-text focus:outline-none focus:theme-border"
            >
              <option value="date_scraped">Latest</option>
              <option value="match_score">Best Match</option>
            </select>
          </div>

          {/* Active filter chips */}
          {(selectedLocations.length > 0 || selectedJobTypes.length > 0) && (
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedLocations.map(loc => (
                <span key={loc} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-yellow-400/15 text-yellow-400 border border-yellow-400/30">
                  <MapPin size={11} /> {loc}
                  <button onClick={() => toggleLocation(loc)} className="ml-1 hover:text-red-400"><X size={11} /></button>
                </span>
              ))}
              {selectedJobTypes.map(type => (
                <span key={type} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-yellow-400/15 text-yellow-400 border border-yellow-400/30">
                  <Briefcase size={11} /> {type}
                  <button onClick={() => toggleJobType(type)} className="ml-1 hover:text-red-400"><X size={11} /></button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <p className="text-gray-400 text-sm">
              Showing <span className="text-white font-semibold">{jobs.length}</span>
              {' '}of <span className="text-white font-semibold">{total}</span> jobs
            </p>
            {loading && <Loader2 size={18} className="text-yellow-500 animate-spin" />}
          </div>

          {jobs.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {jobs.map(job => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onViewDetails={() => setSelectedJob(job)}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-8">
                  <button
                    onClick={() => fetchJobs(page - 1)}
                    disabled={page <= 1 || loading}
                    className="flex items-center gap-1 px-4 py-2 brand-card dark-card rounded-lg theme-text-soft hover:text-[var(--text-main)] disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft size={16} /> Previous
                  </button>
                  <span className="text-gray-400 text-sm">Page {page} of {totalPages}</span>
                  <button
                    onClick={() => fetchJobs(page + 1)}
                    disabled={page >= totalPages || loading}
                    className="flex items-center gap-1 px-4 py-2 brand-card dark-card rounded-lg theme-text-soft hover:text-[var(--text-main)] disabled:opacity-40 transition-colors"
                  >
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="brand-card dark-card rounded-lg p-12 text-center">
              {loading ? (
                <Loader2 size={32} className="text-yellow-500 animate-spin mx-auto" />
              ) : (
                <>
                  <p className="text-gray-400 mb-2">No jobs found matching your criteria.</p>
                  {(selectedLocations.length || selectedJobTypes.length || searchTerm) && (
                    <p className="text-gray-600 text-sm mb-4">
                      Try removing filters or broadening your search.
                    </p>
                  )}
                  <button
                    onClick={clearAllFilters}
                    className="px-6 py-2 bg-[#FACC15] text-[#1F2937] rounded-lg theme-text font-semibold hover:shadow-lg transition-all"
                  >
                    Clear Filters
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
