'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, Sparkles, Key } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '@/lib/auth-context';
import { fetchUserProfile, fetchJobs } from '@/lib/firestore';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  streaming?: boolean;
}

const SUGGESTIONS = [
  'Find Python developer jobs in India',
  'What are the most in-demand skills right now?',
  'Which companies are hiring ML engineers?',
  'How do I improve my resume for a data science role?',
];

export default function ChatPage() {
  const { user } = useAuth();
  const [groqKey, setGroqKey] = useState<string | null>(null);
  const [keyLoading, setKeyLoading] = useState(true);
  const [recentJobContext, setRecentJobContext] = useState<{ title: string; company: string; location: string; skills: string[] }[]>([]);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: "Hi! I'm your TJSR Job Assistant powered by Groq. Ask me about job listings, salary insights, trending skills, or anything related to your job search.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Load Groq key from Firestore + job context for LLM
  useEffect(() => {
    if (!user?.uid) { setKeyLoading(false); return; }
    const load = async () => {
      const [profile, { jobs }] = await Promise.allSettled([
        fetchUserProfile(user.uid),
        fetchJobs({ pageSize: 20, sortBy: 'date_scraped' }),
      ]).then(r => [
        r[0].status === 'fulfilled' ? r[0].value : null,
        r[1].status === 'fulfilled' ? r[1].value : { jobs: [] },
      ] as const);

      setGroqKey(profile?.api_keys?.groq ?? null);
      setRecentJobContext(
        jobs.slice(0, 20).map(j => ({
          title: j.title,
          company: j.company,
          location: j.location || 'Remote',
          skills: j.skills || [],
        }))
      );
      setKeyLoading(false);
    };
    load().catch(() => setKeyLoading(false));
  }, [user?.uid]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    if (!groqKey) return;

    const userMsg: Message = { id: uuidv4(), role: 'user', content: text.trim(), timestamp: new Date() };
    const assistantId = uuidv4();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', timestamp: new Date(), streaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setLoading(true);

    try {
      abortRef.current = new AbortController();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), groqApiKey: groqKey, recentJobs: recentJobContext }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(data.error ?? 'Request failed');
      }

      // Stream SSE response
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value, { stream: true }).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              fullContent += delta;
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m));
            }
          } catch { /* ignore malformed SSE lines */ }
        }
      }

      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, streaming: false } : m));

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Something went wrong.';
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: errMsg, streaming: false } : m
      ));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  if (keyLoading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center h-64">
        <Loader2 size={28} className="text-yellow-500 animate-spin" />
      </div>
    );
  }

  if (!groqKey) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center h-[60vh] gap-6 text-center">
        <div className="p-4 bg-yellow-400/10 rounded-2xl border theme-border">
          <Key size={40} className="text-yellow-500" />
        </div>
        <div>
          <h2 className="text-2xl font-bold theme-text mb-2">Groq API Key Required</h2>
          <p className="theme-muted max-w-sm">
            To use AI Chat, add your free Groq API key in Settings. Your key is stored securely in your account and never shared.
          </p>
        </div>
        <a href="/dashboard/settings?tab=apikeys"
           className="px-6 py-3 bg-[#FACC15] text-[#1F2937] rounded-lg font-semibold hover:shadow-lg transition-all">
          Go to Settings → API Keys
        </a>
        <p className="text-xs theme-muted">
          Get a free key at{' '}
          <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-yellow-500 underline">
            console.groq.com/keys
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-5rem)]">
      {/* Header */}
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center space-x-3 mb-1">
          <div className="p-2 bg-yellow-400/15 rounded-lg border theme-border">
            <Sparkles size={20} className="text-yellow-500" />
          </div>
          <h1 className="text-3xl font-bold theme-text">AI Job Assistant</h1>
        </div>
        <p className="theme-muted text-sm ml-14">Powered by Groq • Context-aware with your job database</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex items-start space-x-3 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              msg.role === 'assistant' ? 'bg-yellow-400/20 border theme-border' : 'bg-blue-600/30 border border-blue-500/40'
            }`}>
              {msg.role === 'assistant' ? <Bot size={16} className="text-yellow-500" /> : <User size={16} className="text-blue-400" />}
            </div>

            <div className={`max-w-[80%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
              <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-yellow-400/15 border theme-border theme-text rounded-tr-sm'
                  : '[background:var(--card-bg)] border theme-border theme-text rounded-tl-sm'
              }`}>
                {msg.streaming && !msg.content
                  ? <Loader2 size={14} className="animate-spin text-yellow-500" />
                  : msg.role === 'assistant'
                    ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                        li: ({ children }) => <li className="theme-text">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold theme-text">{children}</strong>,
                        code: ({ children, className }) => {
                          const isBlock = className?.includes('language-');
                          return isBlock
                            ? <code className="block theme-surface rounded-md p-3 mt-2 mb-2 text-xs font-mono text-yellow-500 overflow-x-auto whitespace-pre">{children}</code>
                            : <code className="theme-surface rounded px-1.5 py-0.5 text-xs font-mono text-yellow-500">{children}</code>;
                        },
                        pre: ({ children }) => <pre className="mb-2">{children}</pre>,
                        h1: ({ children }) => <h1 className="text-lg font-bold theme-text mb-2">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-base font-semibold theme-text mb-2">{children}</h2>,
                        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-yellow-500 hover:text-yellow-400 underline">{children}</a>,
                      }}>
                        {msg.content}
                      </ReactMarkdown>
                    )
                    : msg.content
                }
              </div>
              <p className="text-xs theme-muted px-1">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
        ))}

        {/* Suggestions (only when first message) */}
        {messages.length === 1 && (
          <div className="grid grid-cols-2 gap-2 mt-4">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => sendMessage(s)}
                className="text-left p-3 rounded-xl border theme-border theme-surface hover:bg-yellow-400/8 theme-muted hover:theme-text transition-colors text-xs">
                {s}
              </button>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 flex items-end gap-3 brand-card dark-card rounded-2xl p-3">
        <textarea
          rows={1}
          placeholder="Ask about jobs, skills, companies…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          className="flex-1 bg-transparent theme-text placeholder:text-[var(--text-muted)] resize-none focus:outline-none text-sm max-h-32 disabled:opacity-50"
        />
        <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
          className="p-2.5 bg-[#FACC15] text-[#1F2937] rounded-xl disabled:opacity-40 transition-all hover:shadow-lg flex-shrink-0">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
      <p className="text-center text-xs theme-muted mt-2">Press Enter to send · Shift+Enter for newline</p>
    </div>
  );
}
