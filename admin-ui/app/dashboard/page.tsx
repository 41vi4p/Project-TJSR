'use client';

import Link from 'next/link';
import { Zap, MessageSquare, Bug, Database, ArrowRight } from 'lucide-react';

const tiles = [
  { href: '/dashboard/scraper', icon: Zap,          label: 'Scraper Control',  desc: 'Manage sources, run scrapes, monitor progress' },
  { href: '/dashboard/bot',     icon: MessageSquare, label: 'Bot & Mail',       desc: 'Telegram notifications and email digest control' },
  { href: '/dashboard/debug',   icon: Bug,           label: 'Debug & Logs',     desc: 'Test scraper pipeline, view system logs' },
  { href: '/dashboard/firebase',icon: Database,      label: 'Firebase Sync',    desc: 'Trigger manual syncs to Firestore' },
];

export default function AdminHome() {
  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold theme-text mb-2">Admin Overview</h1>
        <p className="theme-muted">Local control panel — all actions hit <code className="text-yellow-500 text-sm">localhost:8000</code> directly</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {tiles.map(({ href, icon: Icon, label, desc }) => (
          <Link key={href} href={href}
            className="brand-card dark-card p-6 flex items-start gap-4 group hover:border-yellow-400/40 transition-all">
            <div className="p-3 bg-yellow-400/10 rounded-xl border theme-border flex-shrink-0">
              <Icon size={22} className="text-yellow-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold theme-text">{label}</h2>
                <ArrowRight size={16} className="theme-muted group-hover:text-yellow-400 transition-colors" />
              </div>
              <p className="text-sm theme-muted mt-1">{desc}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 p-4 rounded-xl border theme-border text-sm theme-muted"
           style={{ backgroundColor: 'var(--card-bg2)' }}>
        <p className="font-medium theme-text mb-1">Quick Info</p>
        <ul className="space-y-1">
          <li>· Public frontend deployed on Vercel — reads only from Firestore</li>
          <li>· Backend scrapes continuously and syncs to Firestore automatically every 6h</li>
          <li>· Use <strong className="theme-text">Firebase Sync</strong> to manually push data to Firestore</li>
          <li>· Resume uploads queue via Firestore <code className="text-yellow-500">resume_queue</code> — polled every 2 min</li>
        </ul>
      </div>
    </div>
  );
}
