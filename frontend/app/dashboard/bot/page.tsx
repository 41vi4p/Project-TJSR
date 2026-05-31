'use client';

import { useState, useEffect } from 'react';
import { StatCard } from '@/components/dashboard/stat-card';
import { MessageSquare, Send, Clock, ExternalLink, Unlink, Loader2 } from 'lucide-react';
import { botApi, type BotConfig, type BotStatus } from '@/lib/api-client';

export default function BotPage() {
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [digestEnabled, setDigestEnabled] = useState(true);
  const [digestTime, setDigestTime] = useState('08:00');
  const [notifPrefs, setNotifPrefs] = useState({
    new_matching_jobs: true,
    application_updates: true,
    interview_reminders: true,
    trending_companies: false,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [cfg, status] = await Promise.all([botApi.getConfig(), botApi.getStatus()]);
        setConfig(cfg);
        setBotStatus(status);
        setDigestEnabled(cfg.daily_digest_enabled);
        setDigestTime(cfg.digest_time);
        if (cfg.notification_prefs) {
          setNotifPrefs(prev => ({ ...prev, ...cfg.notification_prefs }));
        }
      } catch {
        // backend offline
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await botApi.updateConfig({
        daily_digest_enabled: digestEnabled,
        digest_time: digestTime,
        notification_prefs: notifPrefs,
      });
      setConfig(updated);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDisconnect = async () => {
    try {
      await botApi.disconnect();
      setBotStatus(prev => prev ? { ...prev, connected: false, telegram_chat_id: null } : null);
    } catch { /* ignore */ }
  };

  const isConnected = botStatus?.connected ?? (config?.telegram_connected ?? false);
  const botUsername = botStatus?.bot_username;

  return (
    <div className="max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold theme-text mb-2">Telegram Bot Control</h1>
        <p className="text-gray-400">Manage your daily job digest and bot settings</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          label="Bot Status"
          value={loading ? 'Checking...' : isConnected ? 'Connected' : 'Not Connected'}
          icon={<MessageSquare size={24} className={isConnected ? 'text-green-400' : 'text-yellow-400'} />}
        />
        <StatCard
          label="Daily Digest"
          value={digestEnabled ? `Enabled (${digestTime})` : 'Disabled'}
          icon={<Send size={24} />}
        />
        <StatCard
          label="Deliver Time"
          value={digestTime}
          icon={<Clock size={24} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings */}
        <div className="lg:col-span-2 brand-card dark-card rounded-lg p-6">
          <h2 className="text-2xl font-bold theme-text mb-6">Bot Settings</h2>

          <div className="space-y-6">
            {/* Daily Digest Toggle */}
            <div className="border-b theme-border pb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold theme-text">Daily Digest</h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={digestEnabled}
                    onChange={e => setDigestEnabled(e.target.checked)}
                  />
                  <div className="w-11 h-6 [background:var(--card-bg2)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-400" />
                </label>
              </div>
              <p className="text-gray-400 text-sm">Receive matching jobs every morning via Telegram</p>
            </div>

            {/* Delivery Time */}
            <div className="border-b theme-border pb-6">
              <h3 className="text-lg font-semibold theme-text mb-4 flex items-center space-x-2">
                <Clock size={20} />
                <span>Delivery Time</span>
              </h3>
              <input
                type="time"
                value={digestTime}
                onChange={e => setDigestTime(e.target.value)}
                className="theme-surface border theme-border rounded-lg py-2 px-3 theme-text focus:outline-none focus:theme-border"
              />
            </div>

            {/* Notification Preferences */}
            <div className="border-b theme-border pb-6">
              <h3 className="text-lg font-semibold theme-text mb-4">Notification Preferences</h3>
              <div className="space-y-3">
                {[
                  { key: 'new_matching_jobs', label: 'New matching jobs' },
                  { key: 'application_updates', label: 'Application updates' },
                  { key: 'interview_reminders', label: 'Interview reminders' },
                  { key: 'trending_companies', label: 'Trending companies' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded theme-border theme-surface accent-purple-600"
                      checked={notifPrefs[key as keyof typeof notifPrefs]}
                      onChange={e => setNotifPrefs(prev => ({ ...prev, [key]: e.target.checked }))}
                    />
                    <span className="text-gray-300">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Commands */}
            <div>
              <h3 className="text-lg font-semibold theme-text mb-4">Available Commands</h3>
              <div className="space-y-2 text-sm">
                {[
                  { cmd: '/jobs', desc: 'Browse latest matching jobs with inline navigation' },
                  { cmd: '/stats', desc: 'View your job search statistics' },
                  { cmd: '/search <query>', desc: 'Search jobs by keywords' },
                  { cmd: '/settings', desc: 'Adjust bot preferences' },
                ].map(item => (
                  <div key={item.cmd} className="flex items-start space-x-3 p-3 theme-input rounded-lg">
                    <code className="text-yellow-500 font-mono font-semibold whitespace-nowrap">{item.cmd}</code>
                    <span className="text-gray-400">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center space-x-2 bg-[#FACC15] text-[#1F2937] rounded-lg py-3 theme-text font-semibold hover:shadow-lg dark-card-hover smooth-transition disabled:opacity-60"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </div>

        {/* Bot Status */}
        <div className="brand-card dark-card rounded-lg p-6">
          <h2 className="text-lg font-bold theme-text mb-6">Bot Status</h2>

          <div className="space-y-4">
            {isConnected ? (
              <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/30 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-green-400 font-semibold">Connected</span>
                </div>
                <p className="text-green-300/80 text-sm">Telegram bot is active and delivering messages</p>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border border-yellow-500/30 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                  <span className="text-yellow-400 font-semibold">Not Connected</span>
                </div>
                <p className="text-yellow-300/80 text-sm">Link your Telegram account to receive notifications</p>
              </div>
            )}

            {botStatus?.telegram_chat_id && (
              <div className="border theme-border rounded-lg p-4">
                <p className="text-gray-300 text-sm font-semibold mb-1">Chat ID:</p>
                <p className="text-gray-400 font-mono text-xs">{botStatus.telegram_chat_id}</p>
              </div>
            )}

            {botUsername && (
              <a
                href={`https://t.me/${botUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center space-x-2 bg-[#FACC15] text-[#1F2937] rounded-lg py-3 theme-text font-semibold hover:shadow-lg dark-card-hover smooth-transition"
              >
                <ExternalLink size={18} />
                <span>Open @{botUsername}</span>
              </a>
            )}

            {!isConnected && (
              <div className="border theme-border rounded-lg p-4">
                <p className="text-gray-300 text-sm mb-3">
                  To connect: open the Telegram bot and send <code className="text-yellow-500">/start</code>. A link code will be generated in the bot chat.
                </p>
              </div>
            )}

            {isConnected && (
              <button
                onClick={handleDisconnect}
                className="w-full flex items-center justify-center space-x-2 border border-red-500/30 rounded-lg py-3 text-red-400 font-semibold hover:bg-red-500/10 smooth-transition"
              >
                <Unlink size={18} />
                <span>Disconnect Bot</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
