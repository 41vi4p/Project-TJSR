'use client';

import { useState, useEffect, useCallback } from 'react';
import { JobCard } from '@/components/dashboard/job-card';
import {
  Search, Loader2, X, MapPin, Briefcase, Clock,
  ExternalLink, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { jobsApi, type BackendJob } from '@/lib/api-client';
import { mockJobs } from '@/lib/mock-data';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-slate-900 border border-purple-500/30 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-purple-500/10">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-xl font-bold text-white mb-1 leading-tight">{job.title}</h2>
            <p className="text-purple-300 font-medium">{job.company}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors shrink-0 mt-1">
            <X size={20} />
          </button>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-4 px-6 py-3 border-b border-purple-500/10 text-sm text-gray-400">
          <span className="flex items-center gap-1.5"><MapPin size={14} />{job.location}</span>
          <span className="flex items-center gap-1.5"><Briefcase size={14} />{job.jobType}</span>
          <span className="flex items-center gap-1.5"><Clock size={14} />{job.datePosted}</span>
          {job.salary && <span className="text-purple-400 font-medium">{job.salary}</span>}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Skills */}
          {job.skills.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Skills</p>
              <div className="flex flex-wrap gap-2">
                {job.skills.map(s => (
                  <span key={s} className="px-2 py-1 rounded-md bg-purple-500/20 text-purple-300 text-xs font-medium">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {job.description && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Description</p>
              <p className="text-gray-300 text-sm whitespace-pre-line leading-relaxed">{job.description}</p>
            </div>
          )}

          {/* Source */}
          {job.sourceName && (
            <div className="pt-2 border-t border-purple-500/10">
              <p className="text-xs text-gray-600">
                Source: <span className="text-gray-500">{job.sourceName}</span>
                {job.sourceUrl && job.sourceUrl !== '#' && (
                  <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="ml-2 text-purple-400 hover:text-purple-300 underline">
                    {job.sourceUrl}
                  </a>
                )}
              </p>
            </div>
          )}

          {!job.description && !job.skills.length && (
            <div className="text-center py-8 text-gray-500">
              <p>No detailed information available for this job.</p>
              <p className="text-sm mt-1">The scraper may not have extracted the full description yet.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-purple-500/10 flex gap-3">
          {hasApplyLink ? (
            <a
              href={job.applyLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-500 rounded-lg py-3 text-white font-semibold hover:shadow-lg transition-all"
            >
              <ExternalLink size={16} />
              Apply Now
            </a>
          ) : (
            <div className="flex-1 px-4 py-3 rounded-lg bg-slate-800 text-gray-500 text-sm text-center">
              No apply link available — search for this job directly on the company website
            </div>
          )}
          <button
            onClick={onClose}
            className="px-6 py-3 border border-purple-500/20 rounded-lg text-gray-300 hover:text-white hover:border-purple-500/50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Location Quick Picks ──────────────────────────────────────────────────────

const LOCATION_PICKS = ['India', 'Remote', 'Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'United States'];
const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship'];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [jobTypeFilter, setJobTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('date_scraped');
  const [isTechOnly, setIsTechOnly] = useState<boolean | undefined>(undefined);
  const [jobs, setJobs] = useState(mockJobs as FrontendJob[]);
  const [total, setTotal] = useState(mockJobs.length);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [useMock, setUseMock] = useState(false);
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
      if (locationFilter) params.location = locationFilter;
      if (jobTypeFilter) params.job_type = jobTypeFilter;
      if (isTechOnly !== undefined) params.is_tech = isTechOnly;

      const data = await jobsApi.list(params);
      setJobs(data.jobs.map(toFrontendJob));
      setTotal(data.total);
      setPage(data.page);
      setTotalPages(data.total_pages);
      setUseMock(false);
    } catch {
      setUseMock(true);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, locationFilter, jobTypeFilter, sortBy, isTechOnly]);

  useEffect(() => {
    const t = setTimeout(() => fetchJobs(1), 300);
    return () => clearTimeout(t);
  }, [fetchJobs]);

  const applyLocation = (val: string) => {
    setLocationFilter(val);
    setLocationInput(val);
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setLocationFilter('');
    setLocationInput('');
    setJobTypeFilter('');
    setIsTechOnly(undefined);
  };

  const displayJobs = useMock
    ? (mockJobs as FrontendJob[]).filter(j =>
        j.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        j.company.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : jobs;

  const activeFilterCount = [locationFilter, jobTypeFilter, isTechOnly !== undefined].filter(Boolean).length;

  return (
    <div className="max-w-7xl">
      {selectedJob && <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />}

      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Job Listings</h1>
        <p className="text-gray-400">
          Discover and apply to jobs matched with your profile
          {!useMock && <span className="ml-2 text-purple-400 text-sm">• Live data</span>}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Filters */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-slate-900/50 border border-purple-500/20 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Filters</h3>
              {activeFilterCount > 0 && (
                <button onClick={clearAllFilters} className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
                  Clear all ({activeFilterCount})
                </button>
              )}
            </div>

            {/* Location */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Location</p>
              <input
                type="text"
                placeholder="Type a location…"
                value={locationInput}
                onChange={e => {
                  setLocationInput(e.target.value);
                  if (!e.target.value) setLocationFilter('');
                }}
                onKeyDown={e => { if (e.key === 'Enter') applyLocation(locationInput); }}
                className="w-full bg-slate-800 border border-purple-500/20 rounded-lg py-2 px-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500/50 mb-2"
              />
              {/* Quick picks */}
              <div className="flex flex-wrap gap-1.5">
                {LOCATION_PICKS.map(loc => (
                  <button
                    key={loc}
                    onClick={() => applyLocation(locationFilter === loc ? '' : loc)}
                    className={`text-xs px-2 py-1 rounded-md transition-colors ${
                      locationFilter === loc
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800 text-gray-400 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>

            {/* Job Type */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Job Type</p>
              <div className="space-y-1.5">
                {JOB_TYPES.map(type => (
                  <button
                    key={type}
                    onClick={() => setJobTypeFilter(jobTypeFilter === type ? '' : type)}
                    className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${
                      jobTypeFilter === type
                        ? 'bg-purple-600/30 text-white border border-purple-500/40'
                        : 'text-gray-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Tech / All */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Category</p>
              <div className="space-y-1.5">
                {[
                  { label: 'All Jobs', value: undefined },
                  { label: 'Tech Only', value: true },
                  { label: 'Non-Tech', value: false },
                ].map(({ label, value }) => (
                  <button
                    key={label}
                    onClick={() => setIsTechOnly(value)}
                    className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${
                      isTechOnly === value
                        ? 'bg-purple-600/30 text-white border border-purple-500/40'
                        : 'text-gray-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {/* Search + Sort */}
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search jobs, companies…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-purple-500/20 rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-colors"
              />
            </div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-slate-900 border border-purple-500/20 rounded-lg py-3 px-4 text-white focus:outline-none focus:border-purple-500/50"
            >
              <option value="date_scraped">Latest</option>
              <option value="match_score">Best Match</option>
            </select>
          </div>

          {/* Active filter chips */}
          {(locationFilter || jobTypeFilter) && (
            <div className="flex flex-wrap gap-2 mb-4">
              {locationFilter && (
                <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-purple-600/20 text-purple-300 border border-purple-500/30">
                  <MapPin size={11} /> {locationFilter}
                  <button onClick={() => { setLocationFilter(''); setLocationInput(''); }} className="ml-1 hover:text-white">
                    <X size={11} />
                  </button>
                </span>
              )}
              {jobTypeFilter && (
                <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-purple-600/20 text-purple-300 border border-purple-500/30">
                  <Briefcase size={11} /> {jobTypeFilter}
                  <button onClick={() => setJobTypeFilter('')} className="ml-1 hover:text-white">
                    <X size={11} />
                  </button>
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <p className="text-gray-400 text-sm">
              Showing <span className="text-white font-semibold">{displayJobs.length}</span>
              {!useMock && <> of <span className="text-white font-semibold">{total}</span></>} jobs
            </p>
            {loading && <Loader2 size={18} className="text-purple-400 animate-spin" />}
          </div>

          {displayJobs.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {displayJobs.map(job => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onViewDetails={() => setSelectedJob(job)}
                  />
                ))}
              </div>

              {!useMock && totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-8">
                  <button
                    onClick={() => fetchJobs(page - 1)}
                    disabled={page <= 1 || loading}
                    className="flex items-center gap-1 px-4 py-2 bg-slate-900 border border-purple-500/20 rounded-lg text-gray-300 hover:text-white disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft size={16} /> Previous
                  </button>
                  <span className="text-gray-400 text-sm">Page {page} of {totalPages}</span>
                  <button
                    onClick={() => fetchJobs(page + 1)}
                    disabled={page >= totalPages || loading}
                    className="flex items-center gap-1 px-4 py-2 bg-slate-900 border border-purple-500/20 rounded-lg text-gray-300 hover:text-white disabled:opacity-40 transition-colors"
                  >
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="bg-slate-900/50 border border-purple-500/20 rounded-lg p-12 text-center">
              {loading ? (
                <Loader2 size={32} className="text-purple-400 animate-spin mx-auto" />
              ) : (
                <>
                  <p className="text-gray-400 mb-2">No jobs found matching your criteria.</p>
                  {(locationFilter || jobTypeFilter || searchTerm) && (
                    <p className="text-gray-600 text-sm mb-4">
                      Try removing filters or broadening your search.
                    </p>
                  )}
                  <button
                    onClick={clearAllFilters}
                    className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-500 rounded-lg text-white font-semibold hover:shadow-lg transition-all"
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
