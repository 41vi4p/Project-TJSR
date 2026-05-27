'use client';

import { useState, useEffect } from 'react';
import { StatCard } from '@/components/dashboard/stat-card';
import { TrendingUp, CheckCircle, Clock, Eye, Loader2, Plus } from 'lucide-react';
import { applicationsApi, type ApplicationResponse, type ApplicationStats } from '@/lib/api-client';

const STATUS_COLORS: Record<string, string> = {
  applied: 'bg-blue-500/20 text-blue-300',
  under_review: 'bg-yellow-500/20 text-yellow-300',
  interview_scheduled: 'bg-green-500/20 text-green-300',
  rejected: 'bg-red-500/20 text-red-300',
  offer: 'bg-purple-500/20 text-purple-300',
  accepted: 'bg-emerald-500/20 text-emerald-300',
};

const STATUS_LABELS: Record<string, string> = {
  applied: 'Applied',
  under_review: 'Under Review',
  interview_scheduled: 'Interview Scheduled',
  rejected: 'Rejected',
  offer: 'Offer Received',
  accepted: 'Accepted',
};

export default function TrackingPage() {
  const [applications, setApplications] = useState<ApplicationResponse[]>([]);
  const [stats, setStats] = useState<ApplicationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [apps, appStats] = await Promise.all([
        applicationsApi.list(),
        applicationsApi.stats(),
      ]);
      setApplications(apps);
      setStats(appStats);
    } catch {
      // backend offline — show empty state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleStatusChange = async (appId: string, newStatus: string) => {
    setUpdatingId(appId);
    try {
      const updated = await applicationsApi.update(appId, { status: newStatus });
      setApplications(prev => prev.map(a => a.id === updated.id ? updated : a));
      if (stats) {
        // Refresh stats
        const newStats = await applicationsApi.stats();
        setStats(newStats);
      }
    } catch { /* ignore */ }
    setUpdatingId(null);
  };

  const mockApps = [
    { company: 'TechCorp', role: 'Senior Frontend Dev', status: 'interview_scheduled', date: 'Mar 28' },
    { company: 'CloudAI', role: 'Full Stack Engineer', status: 'under_review', date: 'Mar 25' },
    { company: 'DataFlow', role: 'Backend Developer', status: 'interview_scheduled', date: 'Mar 23' },
    { company: 'DesignFlow', role: 'UI/UX Designer', status: 'rejected', date: 'Mar 20' },
    { company: 'InfraScale', role: 'DevOps Engineer', status: 'under_review', date: 'Mar 18' },
    { company: 'AI Labs', role: 'ML Engineer', status: 'applied', date: 'Mar 15' },
  ];

  const displayApps = applications.length > 0 ? applications : null;
  const displayStats = stats || {
    total: 34, applied: 15, under_review: 8,
    interview_scheduled: 3, rejected: 5, offer: 2, accepted: 1, response_rate: 35,
  };

  return (
    <div className="max-w-7xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Job Tracking Dashboard</h1>
          <p className="text-gray-400">
            Monitor your job applications and search progress
            {!loading && applications.length > 0 && <span className="ml-2 text-purple-400 text-sm">• Live data</span>}
          </p>
        </div>
        <a
          href="/dashboard/jobs"
          className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-500 rounded-lg text-white text-sm font-semibold hover:shadow-lg glow-purple-hover smooth-transition"
        >
          <Plus size={16} />
          <span>Track a Job</span>
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard label="Total Applications" value={String(displayStats.total)} change={3}
          icon={<CheckCircle size={24} className="text-blue-400" />} />
        <StatCard label="In Progress" value={String(displayStats.under_review + displayStats.interview_scheduled)} change={1}
          icon={<Clock size={24} className="text-yellow-400" />} />
        <StatCard label="Interviews" value={String(displayStats.interview_scheduled)} change={0}
          icon={<Eye size={24} className="text-green-400" />} />
        <StatCard label="Response Rate" value={`${displayStats.response_rate}%`} change={5}
          icon={<TrendingUp size={24} className="text-purple-400" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Application Table */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-purple-500/20 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-white mb-6">
            Application Status
            {loading && <Loader2 size={16} className="inline ml-2 text-purple-400 animate-spin" />}
          </h2>

          <div className="space-y-4">
            {displayApps ? (
              displayApps.map(app => (
                <div key={app.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-purple-500/10 hover:border-purple-500/30 smooth-transition">
                  <div className="flex-1">
                    <p className="text-white font-semibold">{app.job?.company || 'Company'}</p>
                    <p className="text-gray-400 text-sm">{app.job?.title || 'Role'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[app.status] || 'bg-gray-500/20 text-gray-300'}`}>
                      {STATUS_LABELS[app.status] || app.status}
                    </span>
                    <select
                      value={app.status}
                      onChange={e => handleStatusChange(app.id, e.target.value)}
                      disabled={updatingId === app.id}
                      className="bg-slate-700 border border-purple-500/20 rounded text-gray-300 text-xs py-1 px-2 focus:outline-none"
                    >
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <p className="text-gray-500 text-xs whitespace-nowrap">
                      {new Date(app.applied_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              // Show mock data or empty state
              !loading && (
                <>
                  {mockApps.map((app, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-purple-500/10">
                      <div className="flex-1">
                        <p className="text-white font-semibold">{app.company}</p>
                        <p className="text-gray-400 text-sm">{app.role}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[app.status]}`}>
                          {STATUS_LABELS[app.status]}
                        </span>
                        <p className="text-gray-500 text-xs">{app.date}</p>
                      </div>
                    </div>
                  ))}
                </>
              )
            )}
            {!loading && (displayApps?.length === 0) && (
              <div className="text-center py-10 text-gray-500">
                <p>No applications tracked yet.</p>
                <a href="/dashboard/jobs" className="text-purple-400 text-sm hover:text-purple-300 mt-2 inline-block">Browse jobs to apply →</a>
              </div>
            )}
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="bg-slate-900/50 border border-purple-500/20 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-6">Status Breakdown</h2>
          <div className="space-y-4">
            {[
              { label: 'Applied', value: displayStats.applied, color: 'bg-blue-500', total: displayStats.total },
              { label: 'Under Review', value: displayStats.under_review, color: 'bg-yellow-500', total: displayStats.total },
              { label: 'Interview', value: displayStats.interview_scheduled, color: 'bg-green-500', total: displayStats.total },
              { label: 'Offer', value: displayStats.offer, color: 'bg-purple-500', total: displayStats.total },
              { label: 'Rejected', value: displayStats.rejected, color: 'bg-red-500', total: displayStats.total },
            ].map(item => {
              const pct = item.total > 0 ? Math.round((item.value / item.total) * 100) : 0;
              return (
                <div key={item.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">{item.label}</span>
                    <span className="text-gray-400">{item.value} ({pct}%)</span>
                  </div>
                  <div className="bg-slate-700 rounded-full h-1.5">
                    <div className={`${item.color} h-1.5 rounded-full smooth-transition`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 border-t border-purple-500/10 pt-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Search Status</h3>
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-green-400 text-sm">Actively Searching</span>
            </div>
            <div className="space-y-2 text-xs text-gray-500">
              <p>🎯 Set preferences to improve matches</p>
              <p>📩 Connect Telegram for instant alerts</p>
              <p>📊 Run the scraper to find new jobs</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
