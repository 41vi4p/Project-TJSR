export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  skills: string[];
  jobType: 'Full-time' | 'Part-time' | 'Contract' | 'Internship';
  salary?: string;
  applyLink: string;
  datePosted: string;
  matchScore: number;
  description: string;
}

export interface Log {
  id: string;
  timestamp: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  source: string;
}

export interface Stat {
  label: string;
  value: number | string;
  change?: number;
}

export interface UserPreferences {
  email: string;
  skills: string[];
  locations: string[];
  jobTypes: string[];
  experienceLevel: string;
}

export const mockJobs: Job[] = [
  {
    id: '1',
    title: 'Junior Frontend Developer',
    company: 'TechStartup Inc',
    location: 'San Francisco, CA',
    skills: ['React', 'TypeScript', 'Tailwind CSS'],
    jobType: 'Full-time',
    salary: '$80K - $120K',
    applyLink: '#',
    datePosted: '2 days ago',
    matchScore: 95,
    description: 'Join our growing team and build amazing web experiences with React and modern web technologies.',
  },
  {
    id: '2',
    title: 'Full Stack Engineer',
    company: 'CloudAI',
    location: 'New York, NY',
    skills: ['Node.js', 'React', 'PostgreSQL', 'AWS'],
    jobType: 'Full-time',
    salary: '$120K - $160K',
    applyLink: '#',
    datePosted: '1 day ago',
    matchScore: 88,
    description: 'Help us build the future of AI-powered cloud solutions with modern tech stack.',
  },
  {
    id: '3',
    title: 'Backend Developer',
    company: 'DataFlow Systems',
    location: 'Remote',
    skills: ['Python', 'FastAPI', 'PostgreSQL', 'Docker'],
    jobType: 'Full-time',
    salary: '$100K - $140K',
    applyLink: '#',
    datePosted: '3 days ago',
    matchScore: 82,
    description: 'Work on scalable backend systems processing millions of data points daily.',
  },
  {
    id: '4',
    title: 'UI/UX Designer',
    company: 'DesignFlow',
    location: 'Austin, TX',
    skills: ['Figma', 'User Research', 'Prototyping'],
    jobType: 'Full-time',
    salary: '$90K - $130K',
    applyLink: '#',
    datePosted: '1 day ago',
    matchScore: 75,
    description: 'Create beautiful and intuitive user interfaces for millions of users worldwide.',
  },
  {
    id: '5',
    title: 'DevOps Engineer',
    company: 'InfraScale',
    location: 'Seattle, WA',
    skills: ['Kubernetes', 'Docker', 'CI/CD', 'AWS'],
    jobType: 'Full-time',
    salary: '$130K - $170K',
    applyLink: '#',
    datePosted: '4 days ago',
    matchScore: 79,
    description: 'Manage and optimize infrastructure for high-scale applications.',
  },
  {
    id: '6',
    title: 'Machine Learning Engineer',
    company: 'AI Labs',
    location: 'Boston, MA',
    skills: ['Python', 'TensorFlow', 'PyTorch', 'SQL'],
    jobType: 'Full-time',
    salary: '$140K - $180K',
    applyLink: '#',
    datePosted: '5 days ago',
    matchScore: 85,
    description: 'Build and deploy cutting-edge ML models that impact millions of users.',
  },
  {
    id: '7',
    title: 'Web Development Intern',
    company: 'StartupHub',
    location: 'Remote',
    skills: ['JavaScript', 'React', 'CSS'],
    jobType: 'Internship',
    salary: '$20/hr',
    applyLink: '#',
    datePosted: '2 days ago',
    matchScore: 92,
    description: 'Perfect opportunity to learn and grow with a passionate team of developers.',
  },
  {
    id: '8',
    title: 'Product Manager',
    company: 'TechVentures',
    location: 'Los Angeles, CA',
    skills: ['Product Strategy', 'Analytics', 'Communication'],
    jobType: 'Full-time',
    salary: '$110K - $150K',
    applyLink: '#',
    datePosted: '6 days ago',
    matchScore: 70,
    description: 'Shape the future of our products and work with cross-functional teams.',
  },
];

export const mockLogs: Log[] = [
  {
    id: '1',
    timestamp: '2024-03-28 14:32:00',
    message: 'Job scraper started successfully',
    type: 'success',
    source: 'Scraper',
  },
  {
    id: '2',
    timestamp: '2024-03-28 14:35:42',
    message: 'Found 127 new job listings from LinkedIn',
    type: 'success',
    source: 'LinkedIn',
  },
  {
    id: '3',
    timestamp: '2024-03-28 14:38:15',
    message: 'Processing job descriptions with AI model',
    type: 'info',
    source: 'AI Parser',
  },
  {
    id: '4',
    timestamp: '2024-03-28 14:42:20',
    message: 'Matched 45 jobs with your profile',
    type: 'success',
    source: 'Matcher',
  },
  {
    id: '5',
    timestamp: '2024-03-28 14:45:00',
    message: 'Resume analysis complete - 92% match potential detected',
    type: 'info',
    source: 'Resume Parser',
  },
  {
    id: '6',
    timestamp: '2024-03-28 14:50:30',
    message: 'Telegram bot connected successfully',
    type: 'success',
    source: 'Bot',
  },
  {
    id: '7',
    timestamp: '2024-03-28 14:55:00',
    message: 'Daily digest sent to 1,234 users',
    type: 'success',
    source: 'Notification',
  },
  {
    id: '8',
    timestamp: '2024-03-28 15:00:00',
    message: 'Next scrape scheduled for 18:00 UTC',
    type: 'info',
    source: 'Scheduler',
  },
];

export const mockStats: Stat[] = [
  { label: 'Total Jobs Found', value: '3,247', change: 12 },
  { label: 'Jobs Today', value: '127', change: 5 },
  { label: 'Matched Jobs', value: '512', change: 23 },
  { label: 'Applications Sent', value: '34', change: 3 },
];

export const mockUserPreferences: UserPreferences = {
  email: 'user@example.com',
  skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'AWS'],
  locations: ['San Francisco', 'Remote', 'New York'],
  jobTypes: ['Full-time', 'Contract'],
  experienceLevel: 'Junior to Mid-level',
};

export const mockLatestJobs = mockJobs.slice(0, 5);
