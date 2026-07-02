'use client';

import { useEffect, useState } from 'react';
import { StatCard } from '@/components/dashboard/stat-card';
import { JobCard } from '@/components/dashboard/job-card';
import { TrendingUp, Users, Zap, Sparkles } from 'lucide-react';
import { fetchDashboardStats, fetchJobs, fetchMatchedJobs, type FSDashboardStats, type FSJob, type FSMatchedJob } from '@/lib/firestore';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';

function timeAgo(ts: Timestamp | string | null | undefined): string {
  if (!ts) return 'recently';
  const date = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type CardJob = {
  id: string; title: string; company: string; location: string;
  skills: string[]; jobType: 'Full-time' | 'Part-time' | 'Contract' | 'Internship';
  salary?: string; applyLink: string; datePosted: string; matchScore: number; description: string;
};

function fsJobToCard(j: FSJob): CardJob {
  return {
    id: j.id, title: j.title, company: j.company,
    location: j.location || 'Remote', skills: j.skills || [],
    jobType: (j.job_type as CardJob['jobType']) || 'Full-time',
    salary: j.salary || undefined, applyLink: j.apply_link || '#',
    datePosted: timeAgo(j.date_posted ?? j.date_scraped),
    matchScore: j.match_score || 0, description: j.description || '',
  };
}

function matchedJobToCard(j: FSMatchedJob): CardJob {
  return {
    id: j.id, title: j.title, company: j.company,
    location: j.location || 'Remote', skills: j.skills || [],
    jobType: (j.job_type as CardJob['jobType']) || 'Full-time',
    salary: j.salary || undefined, applyLink: j.apply_link || '#',
    datePosted: j.date_scraped ? timeAgo(j.date_scraped) : 'recently',
    matchScore: j.match_score || 0, description: j.description || '',
  };
}

export default function DashboardHome() {
  const { user } = useAuth();
  const [stats, setStats] = useState<FSDashboardStats | null>(null);
  const [displayJobs, setDisplayJobs] = useState<CardJob[]>([]);
  const [isMatched, setIsMatched] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        // Try matched jobs first if user has a resume
        if (user?.uid) {
          const matched = await fetchMatchedJobs(user.uid);
          if (matched.length > 0) {
            setDisplayJobs(matched.slice(0, 3).map(matchedJobToCard));
            setIsMatched(true);
          }
        }

        const [statsData, jobsData] = await Promise.allSettled([
          fetchDashboardStats(),
          fetchJobs({ pageSize: 3, sortBy: 'date_scraped' }),
        ]);
        if (statsData.status === 'fulfilled' && statsData.value) setStats(statsData.value);
        else if (statsData.status === 'rejected') console.error('[Firestore] fetchDashboardStats failed:', statsData.reason);
        // Only use latest jobs if we have no matched jobs
        if (jobsData.status === 'fulfilled') {
          setDisplayJobs(prev => prev.length > 0 ? prev : jobsData.value.jobs.map(fsJobToCard));
        } else console.error('[Firestore] fetchJobs (dashboard) failed:', jobsData.reason);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.uid]);

  const displayActivity = (stats?.recent_activity ?? []).slice(0, 5).map(a => ({
    action: a.message,
    company: a.source || 'System',
    time: timeAgo(a.timestamp),
  }));

  return (
    <div className="max-w-7xl overflow-hidden">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--text-main)' }}>Welcome Back!</h1>
        <p style={{ color: 'var(--text-muted)' }}>Here&apos;s what&apos;s happening with your job search today</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats ? (
          <>
            <StatCard label="Total Jobs Found" value={stats.total_jobs.toLocaleString()}   change={stats.total_jobs_change}   icon={<Zap size={24} />} />
            <StatCard label="Jobs Today"        value={stats.jobs_today.toLocaleString()}   change={stats.jobs_today_change}   icon={<TrendingUp size={24} />} />
            <StatCard label="Matched Jobs"      value={stats.matched_jobs.toLocaleString()} change={stats.matched_jobs_change} icon={<Users size={24} />} />
          </>
        ) : (
          [1,2,3].map(i => (
            <div key={i} className="brand-card p-6 animate-pulse">
              <div className="h-4 w-24 rounded mb-3" style={{ backgroundColor: 'var(--border)' }} />
              <div className="h-8 w-16 rounded" style={{ backgroundColor: 'var(--border)' }} />
            </div>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Activity Feed */}
        <div className="lg:col-span-2 brand-card p-6">
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-main)' }}>
            Latest Activity
            {loading && <span className="ml-2 text-sm font-normal animate-pulse" style={{ color: 'var(--text-muted)' }}>Loading…</span>}
          </h2>
          {displayActivity.length > 0 ? (
            <div className="space-y-4">
              {displayActivity.map((item, i) => (
                <div key={i} className="flex items-start gap-4 pb-4 last:pb-0"
                     style={{ borderBottom: i < displayActivity.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0 bg-yellow-400" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm break-words" style={{ color: 'var(--text-main)' }}>{item.action}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.company} • {item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : !loading ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No recent activity yet.</p>
          ) : null}
        </div>

        {/* Tips */}
        <div className="brand-card p-6">
          <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-main)' }}>Tips & Tricks</h3>
          <ul className="space-y-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            {[
              'Upload your resume to get skill-matched job recommendations',
              'Set your Groq API key in Settings to enable AI chat',
              'Explore the Knowledge Graph to discover company networks',
              'Jobs sync from the backend every 6 hours automatically',
            ].map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-yellow-500 font-bold">→</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Latest Job Matches */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>
              {isMatched ? 'Top Resume Matches' : 'Latest Job Matches'}
            </h2>
            {isMatched && (
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-400/15 text-yellow-400">
                <Sparkles size={11} /> AI matched
              </span>
            )}
          </div>
          <a href={isMatched ? '/dashboard/resume' : '/dashboard/jobs'} className="text-sm font-semibold text-yellow-500 hover:text-yellow-400 transition-colors">
            {isMatched ? 'See all matches →' : 'View All →'}
          </a>
        </div>
        {displayJobs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayJobs.map(job => <JobCard key={job.id} job={job} />)}
          </div>
        ) : !loading ? (
          <div className="brand-card p-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            No jobs yet — upload your resume in <a href="/dashboard/resume" className="text-yellow-400 hover:underline">Resume Analyzer</a> to get personalized matches.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1,2,3].map(i => (
              <div key={i} className="brand-card p-6 animate-pulse h-48">
                <div className="h-4 w-32 rounded mb-3" style={{ backgroundColor: 'var(--border)' }} />
                <div className="h-3 w-24 rounded" style={{ backgroundColor: 'var(--border)' }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
