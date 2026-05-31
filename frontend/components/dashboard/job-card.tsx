'use client';

import Image from 'next/image';
import { MapPin, Bookmark, ExternalLink, CheckCircle2, Clock } from 'lucide-react';
import { useState } from 'react';

interface JobCardProps {
  job: {
    id: string;
    title: string;
    company: string;
    location: string;
    salary?: string;
    salary_range?: string;
    datePosted?: string;
    posted_at?: string;
    description?: string;
    is_saved?: boolean;
    apply_link?: string;
    applyLink?: string;
    job_type?: string;
    jobType?: string;
    skills?: string[];
    matchScore?: number;
  };
  onSave?: (id: string, saved: boolean) => void;
  onViewDetails?: () => void;
}

const KNOWN_LOGOS = [
  'Accenture','Adobe','Airbnb','Amazon','Apple','Coinbase','Discord','Dropbox',
  'Figma','Google','Ibm','Intel','Intercom','Meta','Microsoft','Netflix',
  'Oracle','Robinhood','Stripe',
];

function getLogoPath(company: string): string | null {
  const lower = company.toLowerCase();
  const match = KNOWN_LOGOS.find(k => lower.includes(k.toLowerCase()));
  return match ? `/${match}.png` : null;
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Posted today';
  if (days === 1) return 'Posted 1 day ago';
  return `Posted ${days} days ago`;
}

export function JobCard({ job, onSave, onViewDetails }: JobCardProps) {
  const [isSaved,    setIsSaved]    = useState(job.is_saved || false);
  const [logoError,  setLogoError]  = useState(false);
  const logoPath  = getLogoPath(job.company);
  const applyLink = job.applyLink || job.apply_link || '#';
  const jobType   = job.jobType   || job.job_type   || 'Full-time';
  const salary    = job.salary    || job.salary_range;
  const postedAt  = job.datePosted || timeAgo(job.posted_at);

  const toggleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !isSaved;
    setIsSaved(next);
    onSave?.(job.id, next);
  };

  return (
    <div
      onClick={onViewDetails}
      className={`group relative flex flex-col rounded-[24px] p-6 border transition-all duration-300
                    hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)] hover:-translate-y-1
                    bg-white dark:bg-stone-900 border-stone-100 dark:border-stone-800
                    ${onViewDetails ? 'cursor-pointer' : ''}`}>

      {/* Top: Logo + actions */}
      <div className="flex justify-between items-start mb-4">
        <div className="relative">
          <div className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden
                          bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700">
            {logoPath && !logoError ? (
              <Image src={logoPath} alt={job.company} width={56} height={56}
                className="w-full h-full object-cover" onError={() => setLogoError(true)} />
            ) : (
              <span className="text-xl font-bold text-stone-400">
                {job.company?.[0]?.toUpperCase() ?? '?'}
              </span>
            )}
          </div>
          <div className="absolute -top-1 -right-1 bg-white dark:bg-stone-900 rounded-full p-0.5 shadow-sm">
            <CheckCircle2 size={16} className="text-blue-500 fill-blue-500" />
          </div>
        </div>

        <div className="flex gap-1.5">
          <button onClick={e => { e.stopPropagation(); toggleSave(e); }} title={isSaved ? 'Unsave' : 'Save'}
            className="p-2 rounded-full transition-colors hover:bg-stone-50 dark:hover:bg-stone-800"
            style={{ color: isSaved ? '#EAB308' : '#94A3B8' }}>
            <Bookmark size={18} fill={isSaved ? 'currentColor' : 'none'} />
          </button>
          <a href={applyLink} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="p-2 rounded-full text-stone-400 hover:text-stone-600 dark:hover:text-stone-200
                       hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
            <ExternalLink size={16} />
          </a>
        </div>
      </div>

      {/* Title & company */}
      <div className="mb-3">
        <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 leading-tight mb-1
                       group-hover:text-yellow-600 dark:group-hover:text-yellow-400 transition-colors">
          {job.title}
        </h3>
        <p className="text-sm font-medium text-stone-500 dark:text-stone-400">{job.company}</p>
      </div>

      {/* Location */}
      <div className="flex items-center gap-1.5 text-stone-400 mb-3">
        <MapPin size={13} />
        <span className="text-xs font-medium">{job.location || 'Remote'}</span>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold
                         bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-300
                         border border-stone-100 dark:border-stone-700">
          {jobType}
        </span>
        {salary && (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold
                           bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400
                           border border-yellow-100 dark:border-yellow-800/30">
            {salary}
          </span>
        )}
        {job.matchScore !== undefined && job.matchScore > 0 && (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold
                           bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400
                           border border-green-100 dark:border-green-800/30">
            {job.matchScore}% match
          </span>
        )}
      </div>

      {/* Skills */}
      {job.skills && job.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {job.skills.slice(0, 4).map(s => (
            <span key={s} className="px-2 py-0.5 rounded-md text-[10px] font-medium
                                     bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      {job.description && (
        <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed line-clamp-2 mb-auto pb-4">
          {job.description}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-4
                      border-t border-stone-50 dark:border-stone-800">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-stone-400">
          <Clock size={11} />
          <span>{postedAt}</span>
        </div>
        <a href={applyLink} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="px-5 py-2 rounded-xl text-sm font-bold bg-[#FACC15] text-[#1F2937]
                     hover:bg-[#EAB308] hover:shadow-md active:scale-95 transition-all duration-200">
          Apply Now
        </a>
      </div>
    </div>
  );
}
