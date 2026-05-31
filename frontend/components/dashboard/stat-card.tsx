'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
}

export function StatCard({ label, value, change, icon }: StatCardProps) {
  const isPositive = change !== undefined && change > 0;

  return (
    <div className="brand-card dark-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{label}</p>
          <p className="text-3xl font-bold mt-1" style={{ color: 'var(--text-main)' }}>{value}</p>
        </div>
        {icon && (
          <div className="text-yellow-500">{icon}</div>
        )}
      </div>

      {change !== undefined && (
        <div className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-400'}`}>
          {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          <span>{Math.abs(change)}% from last month</span>
        </div>
      )}
    </div>
  );
}
