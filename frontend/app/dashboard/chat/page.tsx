'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { chatApi, streamChat, type ChatResponse } from '@/lib/api-client';
import { v4 as uuidv4 } from 'uuid';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatResponse['sources'];
  timestamp: Date;
  streaming?: boolean;
}

const SUGGESTIONS = [
  'Find Python developer jobs in remote',
  'What are the most in-demand skills right now?',
  'Show me React jobs with salary above $100K',
  'Which companies are hiring ML engineers?',
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: "Hi! I'm your TJSR Job Assistant powered by local AI. Ask me about job listings, salary insights, trending skills, or anything related to your job search. I have access to your scraped job database!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => uuidv4());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    const assistantMsgId = uuidv4();
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setLoading(true);

    try {
      abortRef.current = new AbortController();

      // Try streaming first
      let fullContent = '';
      let sources: ChatResponse['sources'] = [];

      for await (const chunk of streamChat(text.trim(), sessionId, abortRef.current.signal)) {
        if (chunk.type === 'chunk') {
          fullContent += chunk.content;
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId
              ? { ...m, content: fullContent }
              : m
          ));
        } else if (chunk.type === 'sources') {
          sources = chunk.sources;
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: fullContent, sources, streaming: false }
          : m
      ));

    } catch (streamErr) {
      // Fallback to non-streaming
      try {
        const result = await chatApi.send(text.trim(), sessionId);
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: result.message, sources: result.sources, streaming: false }
            : m
        ));
      } catch {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: 'Sorry, I could not connect to the AI backend. Please ensure Ollama is running.',
                streaming: false,
              }
            : m
        ));
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

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
        <p className="text-gray-400 text-sm ml-14">
          Powered by Ollama (local) • RAG-enabled with your job database
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex items-start space-x-3 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
            {/* Avatar */}
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              msg.role === 'assistant'
                ? 'bg-yellow-400/20 border theme-border'
                : 'bg-blue-600/30 border border-blue-500/40'
            }`}>
              {msg.role === 'assistant'
                ? <Bot size={16} className="text-yellow-500" />
                : <User size={16} className="text-blue-400" />
              }
            </div>

            {/* Bubble */}
            <div className={`max-w-[80%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
              <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-purple-600/40 to-blue-600/30 border theme-border theme-text rounded-tr-sm'
                  : '[background:var(--nav-bg)] border theme-border text-gray-200 rounded-tl-sm'
              }`}>
                {msg.streaming && !msg.content
                  ? <Loader2 size={14} className="animate-spin text-yellow-500" />
                  : msg.role === 'assistant'
                    ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                          li: ({ children }) => <li className="text-gray-300">{children}</li>,
                          strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                          em: ({ children }) => <em className="text-gray-300 italic">{children}</em>,
                          code: ({ children, className }) => {
                            const isBlock = className?.includes('language-');
                            return isBlock
                              ? <code className="block theme-surface rounded-md p-3 mt-2 mb-2 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre">{children}</code>
                              : <code className="theme-surface rounded px-1.5 py-0.5 text-xs font-mono text-yellow-400">{children}</code>;
                          },
                          pre: ({ children }) => <pre className="mb-2">{children}</pre>,
                          h1: ({ children }) => <h1 className="text-lg font-bold theme-text mb-2">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-base font-semibold theme-text mb-2">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-semibold theme-text mb-1">{children}</h3>,
                          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-yellow-500 hover:text-yellow-400 underline">{children}</a>,
                          blockquote: ({ children }) => <blockquote className="border-l-2 theme-border pl-3 theme-muted italic my-2">{children}</blockquote>,
                          hr: () => <hr className="border-slate-700 my-3" />,
                          table: ({ children }) => <table className="text-xs border-collapse w-full my-2">{children}</table>,
                          th: ({ children }) => <th className="border border-slate-700 px-2 py-1 text-yellow-400 text-left">{children}</th>,
                          td: ({ children }) => <td className="border border-slate-700 px-2 py-1 theme-text-soft">{children}</td>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    )
                    : msg.content
                }
              </div>

              {/* Sources */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="w-full space-y-1">
                  <p className="text-xs theme-muted ml-1">Sources</p>
                  {msg.sources.map(s => (
                    <div key={s.job_id} className="theme-surface rounded-lg px-3 py-2">
                      <p className="text-xs font-medium text-yellow-400">{s.title}</p>
                      <p className="text-xs theme-muted">{s.company} • {Math.round(s.relevance_score * 100)}% match</p>
                    </div>
                  ))}
                </div>
              )}

              <span className="text-xs text-gray-600 mx-1">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions (shown when only the initial message exists) */}
      {messages.length === 1 && (
        <div className="flex flex-wrap gap-2 mb-4 flex-shrink-0">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="text-xs px-3 py-2 [background:var(--card-bg2)] border theme-border rounded-full theme-text-soft hover:text-[var(--text-main)] hover:theme-border smooth-transition"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 [background:var(--nav-bg)] border theme-border rounded-xl p-3 flex items-end gap-3">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about jobs, skills, salaries…"
          rows={1}
          className="flex-1 bg-transparent theme-text placeholder:text-[var(--text-muted)] resize-none focus:outline-none text-sm leading-relaxed max-h-32"
          style={{ minHeight: '1.5rem' }}
          onInput={e => {
            const t = e.currentTarget;
            t.style.height = 'auto';
            t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          className="flex-shrink-0 p-2.5 bg-[#FACC15] text-[#1F2937] rounded-lg theme-text hover:shadow-lg dark-card-hover smooth-transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
      <p className="text-xs text-gray-600 text-center mt-2 flex-shrink-0">
        Press Enter to send • Shift+Enter for new line
      </p>
    </div>
  );
}
