'use client';

import { useState, useEffect } from 'react';
import {
  MessageSquare, Mail, Send, Clock, ExternalLink, Unlink,
  Loader2, Plus, X, CheckCircle, AlertCircle, Bell,
} from 'lucide-react';
import { botApi, type BotConfig, type BotStatus } from '@/lib/api-client';

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
      ok ? 'bg-green-500/15 text-green-500' : 'bg-red-500/15 text-red-400'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-400'}`} />
      {label}
    </span>
  );
}

export default function BotMailPage() {
  const [config, setConfig]       = useState<BotConfig | null>(null);
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [saving, setSaving]       = useState(false);
  const [loading, setLoading]     = useState(true);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [digestResult, setDigestResult]   = useState<string | null>(null);

  // Telegram settings
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [digestTime, setDigestTime]       = useState('08:00');
  const [linkCode, setLinkCode]           = useState('');
  const [linking, setLinking]             = useState(false);
  const [linkMsg, setLinkMsg]             = useState('');

  // Email list
  const [emailList, setEmailList]   = useState<string[]>([]);
  const [newEmail, setNewEmail]     = useState('');
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [cfg, status] = await Promise.all([botApi.getConfig(), botApi.getStatus()]);
        setConfig(cfg);
        setBotStatus(status);
        setDigestEnabled(cfg.daily_digest_enabled);
        setDigestTime(cfg.digest_time);
        setEmailList((cfg as any).email_list || []);
      } catch { /* backend offline */ }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await botApi.updateConfig({
        daily_digest_enabled: digestEnabled,
        digest_time: digestTime,
        email_list: emailList,
      });
      setConfig(updated);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleConnect = async () => {
    if (!linkCode.trim()) return;
    setLinking(true);
    setLinkMsg('');
    try {
      await botApi.connect(linkCode.trim());
      setLinkMsg('✓ Telegram connected!');
      const status = await botApi.getStatus();
      setBotStatus(status);
    } catch {
      setLinkMsg('✗ Invalid or expired code. Try again.');
    }
    setLinking(false);
  };

  const handleDisconnect = async () => {
    try {
      await botApi.disconnect();
      setBotStatus(prev => prev ? { ...prev, connected: false, telegram_chat_id: null } : null);
    } catch { /* ignore */ }
  };

  const addEmail = () => {
    const e = newEmail.trim().toLowerCase();
    if (!e) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setEmailError('Invalid email address'); return; }
    if (emailList.includes(e)) { setEmailError('Already in list'); return; }
    setEmailList(prev => [...prev, e]);
    setNewEmail('');
    setEmailError('');
  };

  const removeEmail = (e: string) => setEmailList(prev => prev.filter(x => x !== e));

  const handleSendDigest = async () => {
    setSendingDigest(true);
    setDigestResult(null);
    try {
      const res = await botApi.sendEmailDigest();
      setDigestResult(res.message || `Sent to ${res.sent}/${res.total} addresses.`);
    } catch (err: any) {
      setDigestResult('Failed: ' + (err.message || 'Unknown error'));
    }
    setSendingDigest(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={28} className="animate-spin text-yellow-400" />
    </div>
  );

  const card = 'brand-card dark-card p-6 mb-5';

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold theme-text mb-1">Bot & Mail Control</h1>
        <p className="theme-muted text-sm">Manage Telegram notifications and email digest subscribers</p>
      </div>

      {/* ── Telegram Section ── */}
      <div className={card}>
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-yellow-400/15 border theme-border">
            <MessageSquare size={18} className="text-yellow-500" />
          </div>
          <div>
            <h2 className="font-semibold theme-text">Telegram Bot</h2>
            <p className="text-xs theme-muted">Receive job alerts and daily digests via Telegram</p>
          </div>
          <div className="ml-auto">
            <StatusBadge ok={!!botStatus?.connected} label={botStatus?.connected ? 'Connected' : 'Not connected'} />
          </div>
        </div>

        {botStatus?.connected ? (
          <div className="flex items-center justify-between p-3 rounded-xl theme-surface border theme-border mb-4">
            <div>
              <p className="text-sm theme-text font-medium">@{botStatus.bot_username || 'TJSR Bot'}</p>
              <p className="text-xs theme-muted">Chat ID: {botStatus.telegram_chat_id}</p>
            </div>
            <button onClick={handleDisconnect}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
              <Unlink size={13} /> Disconnect
            </button>
          </div>
        ) : (
          <div className="mb-4 p-4 rounded-xl theme-surface border theme-border">
            <p className="text-sm theme-text mb-3">
              1. Open Telegram and message{' '}
              <a href={`https://t.me/${botStatus?.bot_username || 'your_bot'}`}
                target="_blank" rel="noopener noreferrer"
                className="text-yellow-500 underline">
                @{botStatus?.bot_username || 'your_bot'}
              </a>
            </p>
            <p className="text-sm theme-text mb-3">2. Send <code className="bg-yellow-400/15 px-1.5 py-0.5 rounded text-yellow-500">/link</code> to get your code</p>
            <p className="text-sm theme-text mb-3">3. Paste the code below:</p>
            <div className="flex gap-2">
              <input value={linkCode} onChange={e => setLinkCode(e.target.value)}
                placeholder="Enter link code…"
                className="flex-1 theme-input px-3 py-2 text-sm rounded-lg"
                onKeyDown={e => e.key === 'Enter' && handleConnect()} />
              <button onClick={handleConnect} disabled={linking || !linkCode.trim()}
                className="px-4 py-2 bg-[#FACC15] text-[#1F2937] rounded-lg text-sm font-semibold disabled:opacity-50 transition-all">
                {linking ? <Loader2 size={14} className="animate-spin" /> : 'Link'}
              </button>
            </div>
            {linkMsg && <p className={`text-xs mt-2 ${linkMsg.startsWith('✓') ? 'text-green-500' : 'text-red-400'}`}>{linkMsg}</p>}
          </div>
        )}

        {/* Digest settings */}
        <div className="flex flex-col sm:flex-row gap-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={digestEnabled} onChange={e => setDigestEnabled(e.target.checked)}
              className="w-4 h-4 accent-yellow-400" />
            <span className="text-sm theme-text">Daily digest enabled</span>
          </label>
          <div className="flex items-center gap-2">
            <Clock size={14} className="theme-muted" />
            <input type="time" value={digestTime} onChange={e => setDigestTime(e.target.value)}
              className="theme-input px-2 py-1 text-sm rounded-lg" />
            <span className="text-xs theme-muted">UTC</span>
          </div>
        </div>
      </div>

      {/* ── Email List Section ── */}
      <div className={card}>
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-yellow-400/15 border theme-border">
            <Mail size={18} className="text-yellow-500" />
          </div>
          <div>
            <h2 className="font-semibold theme-text">Email Digest List</h2>
            <p className="text-xs theme-muted">These addresses receive personalised job digest emails</p>
          </div>
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-yellow-400/15 text-yellow-500 font-medium">
            {emailList.length} subscriber{emailList.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Add email */}
        <div className="flex gap-2 mb-3">
          <input value={newEmail} onChange={e => { setNewEmail(e.target.value); setEmailError(''); }}
            placeholder="name@example.com"
            className="flex-1 theme-input px-3 py-2 text-sm rounded-lg"
            onKeyDown={e => e.key === 'Enter' && addEmail()} />
          <button onClick={addEmail}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#FACC15] text-[#1F2937] rounded-lg text-sm font-semibold transition-all">
            <Plus size={15} /> Add
          </button>
        </div>
        {emailError && <p className="text-xs text-red-400 mb-2">{emailError}</p>}

        {/* Email chips */}
        {emailList.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-4">
            {emailList.map(e => (
              <span key={e} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs theme-surface border theme-border theme-text">
                {e}
                <button onClick={() => removeEmail(e)} className="text-red-400 hover:text-red-300 transition-colors">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm theme-muted mb-4">No subscribers yet. Add email addresses above.</p>
        )}

        {/* Send digest now */}
        <div className="flex items-center gap-3 pt-4 border-t theme-border">
          <button onClick={handleSendDigest} disabled={sendingDigest || emailList.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border theme-border theme-text hover:bg-yellow-400/10 transition-colors disabled:opacity-50">
            {sendingDigest ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Send Digest Now
          </button>
          {digestResult && (
            <p className={`text-xs ${digestResult.startsWith('Failed') ? 'text-red-400' : 'text-green-500'}`}>
              {digestResult}
            </p>
          )}
        </div>
      </div>

      {/* ── Notification Prefs ── */}
      <div className={card}>
        <div className="flex items-center gap-3 mb-4">
          <Bell size={18} className="text-yellow-500" />
          <h2 className="font-semibold theme-text">Notification Preferences</h2>
        </div>
        <div className="space-y-3">
          {[
            { key: 'new_matching_jobs', label: 'New matching jobs', desc: 'Alert when a job matches your resume skills' },
            { key: 'application_updates', label: 'Application updates', desc: 'Status changes on tracked applications' },
            { key: 'trending_companies', label: 'Trending companies', desc: 'Companies with high hiring velocity' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between p-3 rounded-xl theme-surface border theme-border">
              <div>
                <p className="text-sm theme-text font-medium">{item.label}</p>
                <p className="text-xs theme-muted">{item.desc}</p>
              </div>
              <input type="checkbox" defaultChecked className="w-4 h-4 accent-yellow-400" />
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <button onClick={handleSave} disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 bg-[#FACC15] text-[#1F2937] rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50">
        {saving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  );
}
