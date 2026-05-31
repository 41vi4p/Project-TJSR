'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface FilterPanelProps {
  onFilter?: (filters: FilterState) => void;
}

export interface FilterState {
  jobType: string[];
  location: string[];
  salaryMin: number;
  salaryMax: number;
  skills: string[];
}

export function FilterPanel({ onFilter }: FilterPanelProps) {
  const [expanded, setExpanded] = useState<string | null>('jobType');
  const [filters, setFilters] = useState<FilterState>({
    jobType: [],
    location: [],
    salaryMin: 0,
    salaryMax: 200,
    skills: [],
  });

  const jobTypes = ['Full-time', 'Part-time', 'Contract', 'Internship'];
  const locations = ['Remote', 'San Francisco', 'New York', 'Austin', 'Los Angeles'];
  const skills = ['React', 'TypeScript', 'Node.js', 'Python', 'AWS', 'PostgreSQL'];

  const handleJobTypeChange = (type: string) => {
    setFilters(prev => ({
      ...prev,
      jobType: prev.jobType.includes(type)
        ? prev.jobType.filter(t => t !== type)
        : [...prev.jobType, type]
    }));
  };

  const handleLocationChange = (location: string) => {
    setFilters(prev => ({
      ...prev,
      location: prev.location.includes(location)
        ? prev.location.filter(l => l !== location)
        : [...prev.location, location]
    }));
  };

  return (
    <div className="bg-slate-900/50 border border-purple-500/20 rounded-lg p-6">
      <h3 className="text-lg font-bold text-white mb-6">Filters</h3>

      <div className="space-y-4">
        {/* Job Type */}
        <div className="border-b border-purple-500/10 pb-4">
          <button
            onClick={() => setExpanded(expanded === 'jobType' ? null : 'jobType')}
            className="w-full flex items-center justify-between text-white font-semibold hover:text-purple-400 smooth-transition"
          >
            Job Type
            <ChevronDown size={20} className={`transform transition-transform ${expanded === 'jobType' ? 'rotate-180' : ''}`} />
          </button>
          
          {expanded === 'jobType' && (
            <div className="mt-3 space-y-2">
              {jobTypes.map(type => (
                <label key={type} className="flex items-center space-x-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={filters.jobType.includes(type)}
                    onChange={() => handleJobTypeChange(type)}
                    className="w-4 h-4 rounded border-purple-500/20 bg-slate-800 accent-purple-600"
                  />
                  <span className="text-gray-400 group-hover:text-white smooth-transition">{type}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Location */}
        <div className="border-b border-purple-500/10 pb-4">
          <button
            onClick={() => setExpanded(expanded === 'location' ? null : 'location')}
            className="w-full flex items-center justify-between text-white font-semibold hover:text-purple-400 smooth-transition"
          >
            Location
            <ChevronDown size={20} className={`transform transition-transform ${expanded === 'location' ? 'rotate-180' : ''}`} />
          </button>
          
          {expanded === 'location' && (
            <div className="mt-3 space-y-2">
              {locations.map(location => (
                <label key={location} className="flex items-center space-x-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={filters.location.includes(location)}
                    onChange={() => handleLocationChange(location)}
                    className="w-4 h-4 rounded border-purple-500/20 bg-slate-800 accent-purple-600"
                  />
                  <span className="text-gray-400 group-hover:text-white smooth-transition">{location}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Salary Range */}
        <div className="border-b border-purple-500/10 pb-4">
          <button
            onClick={() => setExpanded(expanded === 'salary' ? null : 'salary')}
            className="w-full flex items-center justify-between text-white font-semibold hover:text-purple-400 smooth-transition"
          >
            Salary Range
            <ChevronDown size={20} className={`transform transition-transform ${expanded === 'salary' ? 'rotate-180' : ''}`} />
          </button>
          
          {expanded === 'salary' && (
            <div className="mt-3">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">${filters.salaryMin}K</span>
                  <span className="text-gray-400">${filters.salaryMax}K</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={filters.salaryMax}
                  onChange={(e) => setFilters(prev => ({ ...prev, salaryMax: Number(e.target.value) }))}
                  className="w-full accent-purple-600"
                />
              </div>
            </div>
          )}
        </div>

        {/* Clear Filters */}
        <button
          onClick={() => setFilters({ jobType: [], location: [], salaryMin: 0, salaryMax: 200, skills: [] })}
          className="w-full mt-4 px-4 py-2 border border-purple-500/20 rounded-lg text-gray-400 hover:text-white hover:border-purple-500/50 smooth-transition"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
}
