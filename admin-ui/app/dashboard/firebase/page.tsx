'use client';

import { useState } from 'react';
import {
  Database, RefreshCw, Upload, BarChart2,
  CheckCircle, AlertCircle, Loader2,
} from 'lucide-react';
import { firebaseAdminApi } from '@/lib/api-client';

interface ActionState { loading: boolean; status: 'idle' | 'success' | 'error'; message: string }
const IDLE: ActionState = { loading: false, status: 'idle', message: '' };

export default function FirebaseSyncPage() {
  const [statsState, setStatsState] = useState<ActionState>(IDLE);
  const [graphState, setGraphState] = useState<ActionState>(IDLE);
  const [bulkState,  setBulkState]  = useState<ActionState>(IDLE);

  const run = async (
    fn: () => Promise<unknown>,
    setState: React.Dispatch<React.SetStateAction<ActionState>>,
  ) => {
    setState({ loading: true, status: 'idle', message: '' });
    try {
      await fn();
      setState({ loading: false, status: 'success', message: 'Done!' });
    } catch (err: unknown) {
      setState({ loading: false, status: 'error', message: err instanceof Error ? err.message : 'Failed' });
    }
  };

  const tiles = [
    {
      icon: BarChart2,
      label: 'Sync Stats',
      desc: 'Reads aggregated metrics from system_logs → writes to Firestore stats/dashboard',
      state: statsState,
      action: () => run(firebaseAdminApi.syncStats, setStatsState),
      buttonLabel: 'Sync Stats Now',
    },
    {
      icon: RefreshCw,
      label: 'Sync Graph Snapshot',
      desc: 'Reads up to 300 nodes from Neo4j → writes to Firestore graph/snapshot',
      state: graphState,
      action: () => run(firebaseAdminApi.syncGraph, setGraphState),
      buttonLabel: 'Sync Graph Now',
    },
    {
      icon: Upload,
      label: 'Bulk Sync Jobs',
      desc: 'One-time migration: syncs all active PostgreSQL jobs → Firestore jobs collection (up to 500 per batch)',
      state: bulkState,
      action: () => run(firebaseAdminApi.bulkSyncJobs, setBulkState),
      buttonLabel: 'Start Bulk Sync',
      danger: true,
    },
  ];

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold theme-text mb-2 flex items-center gap-3">
          <Database size={28} className="text-yellow-500" />
          Firebase Sync
        </h1>
        <p className="theme-muted">Manually trigger data sync from local backend to Firestore (public frontend data source)</p>
      </div>

      <div className="mb-6 p-4 rounded-xl border theme-border text-sm theme-muted"
           style={{ backgroundColor: 'var(--card-bg2)' }}>
        <p className="font-medium theme-text mb-1">Automatic sync schedule</p>
        <ul className="space-y-0.5">
          <li>· <strong className="theme-text">Jobs</strong> — synced automatically on each Celery scrape run</li>
          <li>· <strong className="theme-text">Stats</strong> — synced after each scrape run</li>
          <li>· <strong className="theme-text">Graph</strong> — synced every 6h 30m (crontab: minute=30, hour=*/6)</li>
          <li>· <strong className="theme-text">Resume queue</strong> — consumed every 2 minutes</li>
        </ul>
      </div>

      <div className="space-y-4">
        {tiles.map(({ icon: Icon, label, desc, state, action, buttonLabel, danger }) => (
          <div key={label} className="brand-card dark-card p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-yellow-400/10 rounded-xl border theme-border flex-shrink-0">
                <Icon size={20} className="text-yellow-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold theme-text mb-1">{label}</h2>
                <p className="text-sm theme-muted mb-4">{desc}</p>

                {state.status !== 'idle' && (
                  <div className={`flex items-center gap-2 text-sm mb-3 ${state.status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                    {state.status === 'success'
                      ? <CheckCircle size={14} />
                      : <AlertCircle size={14} />
                    }
                    {state.message}
                  </div>
                )}

                <button onClick={action} disabled={state.loading}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 ${
                    danger
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30'
                      : 'bg-[#FACC15] text-[#1F2937] hover:shadow-lg'
                  }`}>
                  {state.loading ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
                  {state.loading ? 'Running…' : buttonLabel}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
