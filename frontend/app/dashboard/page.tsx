'use client';

import { useEffect, useState } from 'react';
import { StatCard } from '@/components/dashboard/stat-card';
import { JobCard } from '@/components/dashboard/job-card';
import { TrendingUp, Users, Zap } from 'lucide-react';
import { statsApi, jobsApi, type DashboardStats, type ActivityItem, type BackendJob } from '@/lib/api-client';

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
  };
}

export default function DashboardHome() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [latestJobs, setLatestJobs] = useState<ReturnType<typeof toFrontendJob>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsData, activityData, jobsData] = await Promise.allSettled([
          statsApi.dashboard(),
          statsApi.activity(6),
          jobsApi.list({ page_size: 3, sort_by: 'date_scraped', sort_order: 'desc' }),
        ]);
        if (statsData.status === 'fulfilled') setStats(statsData.value);
        if (activityData.status === 'fulfilled') setActivity(activityData.value);
        if (jobsData.status === 'fulfilled') setLatestJobs(jobsData.value.jobs.map(toFrontendJob));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const displayActivity = activity.map(a => ({
    action: a.message,
    company: (a.metadata?.source as string) || 'System',
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
              {displayActivity.slice(0, 5).map((item, i) => (
                <div key={i} className="flex items-start gap-4 pb-4 last:pb-0"
                     style={{ borderBottom: i < Math.min(displayActivity.length, 5) - 1 ? '1px solid var(--border)' : 'none' }}>
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
              'Complete your profile to get better matches',
              'Check our Telegram bot for daily job digests',
              'Explore the Knowledge Graph to discover company networks',
              'Use the AI Chat to query your job database',
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
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>Latest Job Matches</h2>
          <a href="/dashboard/jobs" className="text-sm font-semibold text-yellow-500 hover:text-yellow-400 transition-colors">
            View All →
          </a>
        </div>
        {latestJobs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {latestJobs.map(job => <JobCard key={job.id} job={job} />)}
          </div>
        ) : !loading ? (
          <div className="brand-card p-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            No jobs yet — run the scraper to populate listings.
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
