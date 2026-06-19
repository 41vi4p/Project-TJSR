'use client';

import Link from 'next/link';
import { Bot } from 'lucide-react';

export default function BotRedirect() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-6 text-center max-w-md mx-auto">
      <div className="p-4 bg-yellow-400/10 rounded-2xl border theme-border">
        <Bot size={40} className="text-yellow-500" />
      </div>
      <div>
        <h1 className="text-2xl font-bold theme-text mb-2">Bot Control</h1>
        <p className="theme-muted">
          Bot controls are available in the <strong>Admin Panel</strong> running locally on your machine (port 3001).
          This public frontend is read-only.
        </p>
      </div>
      <Link href="/dashboard" className="px-6 py-3 bg-[#FACC15] text-[#1F2937] rounded-lg font-semibold hover:shadow-lg transition-all">
        Back to Dashboard
      </Link>
    </div>
  );
}
