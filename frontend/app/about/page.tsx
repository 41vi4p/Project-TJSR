import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Search, Brain, Target, BellRing, MessageSquare, Network,
  Server, Cloud, Shield, Github, ArrowRight, Database, Bot,
} from 'lucide-react';
import { Navbar } from '@/components/landing/navbar';
import { Footer } from '@/components/landing/footer';

export const metadata: Metadata = {
  title: 'About — TJSR',
  description: 'What TJSR is, how the discovery-to-match pipeline works, and how the project is built.',
};

const pipeline = [
  {
    icon: Search,
    title: 'Discover',
    description: '10 scraper engines (BS4, Playwright, Selenium, Crawl4AI and more) plus 4 public job APIs pull new postings every 6 hours — no source URL required.',
  },
  {
    icon: Brain,
    title: 'Classify',
    description: 'A fine-tuned DistilBERT model tags every posting as tech or non-tech, with a keyword-based fallback for edge cases.',
  },
  {
    icon: Target,
    title: 'Match',
    description: 'Your resume is scored against each job with a hybrid of keyword overlap and Qdrant semantic similarity — with a gap analysis of missing skills.',
  },
  {
    icon: BellRing,
    title: 'Notify',
    description: 'New matches reach you through the in-app bell, a Telegram bot, or an email digest — whichever you\'ve set up.',
  },
];

const features = [
  { icon: Brain, title: 'AI Job Matching', description: 'Hybrid keyword + semantic scoring surfaces the roles that actually fit your skills.' },
  { icon: BellRing, title: 'Instant Alerts', description: 'Get notified the moment a job scoring ≥40% skill overlap is discovered.' },
  { icon: MessageSquare, title: 'RAG Chat', description: 'Ask an AI assistant about the job database — grounded in the top semantically similar postings.' },
  { icon: Network, title: 'Knowledge Graph', description: 'A Neo4j graph of company–skill relationships, visualised right in the dashboard.' },
  { icon: Bot, title: 'Telegram Bot', description: 'Daily digests, instant match alerts, and chatbot Q&A without opening the app.' },
  { icon: Shield, title: 'Resume Analysis', description: 'Upload a PDF and get an ATS-style score, section breakdown, and improvement suggestions.' },
];

const stack = [
  { category: 'Frontend', items: ['Next.js 16', 'React', 'Tailwind v4', 'TanStack Query'] },
  { category: 'Backend', items: ['FastAPI', 'SQLAlchemy 2.0', 'Celery', 'Redis'] },
  { category: 'Data', items: ['PostgreSQL 16', 'Qdrant', 'Neo4j 5', 'Firebase Firestore'] },
  { category: 'AI / ML', items: ['Fine-tuned DistilBERT', 'Ollama (RAG)', 'Groq (chat)'] },
];

const deployables = [
  {
    icon: Cloud,
    title: 'Public Frontend',
    subtitle: 'Vercel',
    description: 'The dashboard you\'re using now. Reads jobs, stats and your profile straight from Firestore — it never talks to the backend directly, so it deploys and scales independently.',
  },
  {
    icon: Server,
    title: 'Backend',
    subtitle: 'Self-hosted',
    description: 'FastAPI + Celery does the heavy lifting: scraping, classification, matching, and building the knowledge graph. Runs against Postgres, Qdrant, Neo4j and Ollama, then pushes clean results into Firestore.',
  },
  {
    icon: Database,
    title: 'Admin UI',
    subtitle: 'Local only',
    description: 'A separate local-only console for scraper control, bot configuration and debug logs — talks to the backend directly and is never exposed publicly.',
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-36 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block text-xs font-semibold tracking-widest text-yellow-400 uppercase mb-4">
            About the project
          </span>
          <h1 className="text-4xl sm:text-6xl font-bold mb-6">
            A full-stack AI pipeline for <span className="text-[#FACC15]">finding the right job</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            TJSR continuously scrapes career pages and job boards, classifies every posting,
            scores it against your resume, and tells you the moment something worth applying to shows up.
          </p>
        </div>
      </section>

      {/* Pipeline */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-yellow-400/10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">How it works</h2>
            <p className="text-gray-400">Four stages, running on a schedule, from raw listing to a notification in your pocket.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {pipeline.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="relative">
                  <div className="bg-slate-900/50 border border-yellow-400/20 rounded-xl p-6 h-full smooth-transition hover:border-yellow-400/40">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 shrink-0 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-lg flex items-center justify-center">
                        <Icon size={20} className="text-[#1F2937]" />
                      </div>
                      <span className="text-xs font-mono text-gray-500">0{i + 1}</span>
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                    <p className="text-sm text-gray-400">{step.description}</p>
                  </div>
                  {i < pipeline.length - 1 && (
                    <ArrowRight size={18} className="hidden md:block text-yellow-400/40 absolute top-1/2 -right-4 -translate-y-1/2 z-10" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-yellow-400/10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">How it&apos;s built</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              TJSR is split into three independent pieces. Firebase — Firestore, Auth, and Storage — is the
              only bridge between them, so the public site never depends on any one machine being online.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {deployables.map(d => {
              const Icon = d.icon;
              return (
                <div key={d.title} className="bg-slate-900/50 border border-yellow-400/20 rounded-xl p-6 smooth-transition hover:border-yellow-400/40">
                  <div className="w-12 h-12 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-lg flex items-center justify-center mb-4">
                    <Icon size={24} className="text-[#1F2937]" />
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <h3 className="text-lg font-semibold">{d.title}</h3>
                    <span className="text-xs text-yellow-400/80 font-mono">{d.subtitle}</span>
                  </div>
                  <p className="text-sm text-gray-400">{d.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-yellow-400/10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">What you get</h2>
            <p className="text-gray-400">The full feature set, beyond the highlights on the homepage.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map(feature => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="bg-slate-900/50 border border-yellow-400/20 rounded-xl p-6 smooth-transition hover:bg-slate-800/50 hover:border-yellow-400/40">
                  <div className="w-12 h-12 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-lg flex items-center justify-center mb-4">
                    <Icon size={24} className="text-[#1F2937]" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-gray-400">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Stack */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-yellow-400/10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">Tech stack</h2>
            <p className="text-gray-400">Open source, and built to be self-hosted.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {stack.map(group => (
              <div key={group.category} className="bg-slate-900/50 border border-yellow-400/20 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-yellow-400 uppercase tracking-wide mb-4">{group.category}</h3>
                <ul className="space-y-2">
                  {group.items.map(item => (
                    <li key={item} className="text-gray-300 text-sm">{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Open source CTA */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-yellow-400/10">
        <div className="max-w-4xl mx-auto text-center bg-slate-900/50 border border-yellow-400/20 rounded-2xl p-10 sm:p-14">
          <Github size={32} className="mx-auto text-yellow-400 mb-4" />
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Open source, GPL-3.0 licensed</h2>
          <p className="text-gray-400 mb-8 max-w-xl mx-auto">
            The full source — scrapers, classifier training, matching, and every frontend — is on GitHub.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://github.com/41vi4p/Project-TJSR"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#FACC15] hover:bg-[#EAB308] rounded-lg text-[#1F2937] font-semibold hover:shadow-lg smooth-transition"
            >
              <Github size={18} /> View on GitHub
            </a>
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 px-6 py-3 border border-yellow-400/30 hover:border-yellow-400/60 rounded-lg text-white font-semibold smooth-transition"
            >
              Get started <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
