'use client';

import { Job } from '@/lib/mock-data';
import { MapPin, Briefcase, Clock, ArrowUpRight } from 'lucide-react';

interface JobCardProps {
  job: Job;
  onViewDetails?: () => void;
  onApply?: () => void;
}

export function JobCard({ job, onViewDetails, onApply }: JobCardProps) {
  const matchPercentage = job.matchScore;
  const matchColor = matchPercentage >= 90 ? 'text-green-400' : matchPercentage >= 75 ? 'text-blue-400' : 'text-yellow-400';

  return (
    <div className="bg-slate-900/50 border border-purple-500/20 rounded-lg p-6 glow-purple-hover smooth-transition hover:bg-slate-800/50 flex flex-col justify-between">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">{job.title}</h3>
            <p className="text-gray-400">{job.company}</p>
          </div>
          <div className={`text-right ${matchColor}`}>
            <div className="text-2xl font-bold">{job.matchScore}%</div>
            <div className="text-xs">Match</div>
          </div>
        </div>

        {/* Info Row */}
        <div className="flex flex-wrap gap-4 text-sm text-gray-400 mb-4">
          <div className="flex items-center space-x-1">
            <MapPin size={16} />
            <span>{job.location}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Briefcase size={16} />
            <span>{job.jobType}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Clock size={16} />
            <span>{job.datePosted}</span>
          </div>
        </div>

        {/* Salary */}
        {job.salary && (
          <div className="mb-4">
            <p className="text-purple-400 font-semibold">{job.salary}</p>
          </div>
        )}

        {/* Description */}
        <p className="text-gray-400 text-sm line-clamp-2">{job.description}</p>
      </div>

      {/* Skills */}
      <div className="mb-4">
        <div className="flex flex-wrap gap-2">
          {job.skills.slice(0, 3).map((skill, index) => (
            <span
              key={index}
              className="inline-flex items-center px-2 py-1 rounded-md bg-purple-500/20 text-purple-300 text-xs font-medium"
            >
              {skill}
            </span>
          ))}
          {job.skills.length > 3 && (
            <span className="inline-flex items-center px-2 py-1 text-gray-400 text-xs">
              +{job.skills.length - 3} more
            </span>
          )}
        </div>
      </div>

      {/* Button */}
      <button
        onClick={onViewDetails || onApply}
        className="w-full bg-gradient-to-r from-purple-600 to-blue-500 rounded-lg py-2 text-white font-medium hover:shadow-lg glow-purple-hover smooth-transition flex items-center justify-center space-x-2"
      >
        <span>View Details</span>
        <ArrowUpRight size={16} />
      </button>
    </div>
  );
}
