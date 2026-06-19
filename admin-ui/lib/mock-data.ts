export interface Log {
  id: string;
  timestamp: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  source: string;
}

export const mockLogs: Log[] = [
  { id: '1', timestamp: '2024-03-28 14:32:00', message: 'Job scraper started successfully',              type: 'success', source: 'Scraper'      },
  { id: '2', timestamp: '2024-03-28 14:35:42', message: 'Found 127 new job listings from LinkedIn',      type: 'success', source: 'LinkedIn'     },
  { id: '3', timestamp: '2024-03-28 14:38:15', message: 'Processing job descriptions with AI model',     type: 'info',    source: 'AI Parser'   },
  { id: '4', timestamp: '2024-03-28 14:42:20', message: 'Matched 45 jobs with your profile',             type: 'success', source: 'Matcher'      },
  { id: '5', timestamp: '2024-03-28 14:45:00', message: 'Resume analysis complete',                       type: 'info',    source: 'Resume'      },
  { id: '6', timestamp: '2024-03-28 14:50:30', message: 'Telegram bot connected successfully',           type: 'success', source: 'Bot'          },
  { id: '7', timestamp: '2024-03-28 14:55:00', message: 'Daily digest sent to subscribers',              type: 'success', source: 'Notification' },
  { id: '8', timestamp: '2024-03-28 15:00:00', message: 'Next scrape scheduled for 18:00 UTC',           type: 'info',    source: 'Scheduler'   },
  { id: '9', timestamp: '2024-03-28 15:05:00', message: 'Failed to parse job listing from Indeed',       type: 'error',   source: 'Parser'      },
  { id: '10',timestamp: '2024-03-28 15:10:00', message: 'Rate limit hit on LinkedIn scraper, retrying', type: 'warning', source: 'Scraper'      },
];
