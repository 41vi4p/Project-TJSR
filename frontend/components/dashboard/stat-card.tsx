'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
}

export function StatCard({ label, value, change, icon }: StatCardProps) {
  const isPositive = change && change > 0;

  return (
    <div className="bg-slate-900/50 border border-purple-500/20 rounded-lg p-6 glow-purple-hover smooth-transition">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-gray-400 text-sm font-medium">{label}</p>
          <p className="text-3xl font-bold text-white mt-1">{value}</p>
        </div>
        {icon && (
          <div className="text-purple-400">{icon}</div>
        )}
      </div>

      {change !== undefined && (
        <div className={`flex items-center space-x-1 text-sm font-medium ${
          isPositive ? 'text-green-400' : 'text-red-400'
        }`}>
          {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          <span>{Math.abs(change)}% from last month</span>
        </div>
      )}
    </div>
  );
}
