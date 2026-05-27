'use client';

import { useEffect, useState } from 'react';
import { StatCard } from '@/components/dashboard/stat-card';
import { JobCard } from '@/components/dashboard/job-card';
import { TrendingUp, Users, Zap, CheckCircle } from 'lucide-react';
import { statsApi, jobsApi, type DashboardStats, type ActivityItem, type BackendJob } from '@/lib/api-client';
import { mockStats, mockLatestJobs } from '@/lib/mock-data';

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
      } catch {
        // backend may not be running — fall through to mock data
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Build stat cards from backend or fall back to mock
  const statCards = stats
    ? [
        { label: 'Total Jobs Found', value: stats.total_jobs.toLocaleString(), change: stats.total_jobs_change },
        { label: 'Jobs Today', value: stats.jobs_today.toLocaleString(), change: stats.jobs_today_change },
        { label: 'Matched Jobs', value: stats.matched_jobs.toLocaleString(), change: stats.matched_jobs_change },
        { label: 'Applications Sent', value: stats.applications_sent.toLocaleString(), change: stats.applications_change },
      ]
    : mockStats;

  const displayJobs = latestJobs.length > 0 ? latestJobs : mockLatestJobs;

  const displayActivity = activity.length > 0
    ? activity.map(a => ({
        action: a.message,
        company: (a.metadata?.source as string) || 'System',
        time: timeAgo(a.timestamp),
      }))
    : [
        { action: 'Applied to Senior Frontend Developer', company: 'TechCorp', time: '2 hours ago' },
        { action: 'Matched with 15 new job listings', company: 'AI Matching', time: '4 hours ago' },
        { action: 'Resume analyzed successfully', company: 'System', time: '1 day ago' },
        { action: 'Interview scheduled with CloudAI', company: 'CloudAI', time: '2 days ago' },
      ];

  return (
    <div className="max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Welcome Back!</h1>
        <p className="text-gray-400">Here&apos;s what&apos;s happening with your job search today</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard label={statCards[0].label} value={statCards[0].value} change={statCards[0].change} icon={<Zap size={24} />} />
        <StatCard label={statCards[1].label} value={statCards[1].value} change={statCards[1].change} icon={<TrendingUp size={24} />} />
        <StatCard label={statCards[2].label} value={statCards[2].value} change={statCards[2].change} icon={<Users size={24} />} />
        <StatCard label={statCards[3].label} value={statCards[3].value} change={statCards[3].change} icon={<CheckCircle size={24} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Activity Feed */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-purple-500/20 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">
            Latest Activity
            {loading && <span className="ml-2 text-sm text-gray-500 font-normal animate-pulse">Loading…</span>}
          </h2>
          <div className="space-y-4">
            {displayActivity.slice(0, 5).map((activity, index) => (
              <div key={index} className="flex items-start space-x-4 pb-4 border-b border-purple-500/10 last:border-0 last:pb-0">
                <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0"></div>
                <div className="flex-1">
                  <p className="text-white font-medium">{activity.action}</p>
                  <p className="text-gray-400 text-sm">{activity.company} • {activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tips & Tricks */}
        <div className="bg-gradient-to-br from-purple-600/20 to-blue-500/20 border border-purple-500/30 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-4">Tips & Tricks</h3>
          <ul className="space-y-3 text-sm text-gray-300">
            {[
              'Complete your profile to get better matches',
              'Check our Telegram bot for daily job digests',
              'Explore the Knowledge Graph to discover company networks',
              'Use the AI Chat to query your job database',
            ].map((tip, i) => (
              <li key={i} className="flex items-start space-x-2">
                <span className="text-purple-400 font-bold">→</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Latest Job Matches */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Latest Job Matches</h2>
          <a href="/dashboard/jobs" className="text-purple-400 hover:text-purple-300 font-semibold smooth-transition">
            View All →
          </a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      </div>
    </div>
  );
}
