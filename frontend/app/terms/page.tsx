import type { Metadata } from 'next';
import Link from 'next/link';
import { Navbar } from '@/components/landing/navbar';
import { Footer } from '@/components/landing/footer';

export const metadata: Metadata = {
  title: 'Terms & Conditions — TJSR',
  description: 'Terms of use for the TJSR job discovery platform.',
};

const sections = [
  {
    title: '1. What TJSR is',
    body: [
      'TJSR is a free, open-source (GPL-3.0) job discovery and research tool. It aggregates publicly available job postings and public information about companies, and provides AI-assisted analysis on top of them.',
      'It is a community project, provided "as is", without warranty of any kind.',
    ],
  },
  {
    title: '2. Company background checks are informational only',
    body: [
      'Company reports are automatically generated summaries of public sources (company websites, news, search results, public code repositories) with citations, plus deterministic heuristic checks (e.g. domain age, fee-for-training mentions).',
      'They are NOT professional due diligence, legal advice, or a verdict on any company. Sources can be wrong, outdated, satirical, or about a different company with a similar name.',
      'Red flags are heuristics designed to prompt further checking — always verify via the cited sources and official registries (e.g. MCA for Indian companies) before accepting or declining an offer.',
      'TJSR and its contributors accept no liability for decisions made based on reports, and no statement in a report should be treated as an assertion of fact by TJSR about any company.',
    ],
  },
  {
    title: '3. Your responsibilities',
    body: [
      'Use your own Groq API key only in accordance with Groq’s terms of service.',
      'Do not submit content you do not have the right to share (e.g. confidential internal documents as "job descriptions").',
      'Do not use TJSR to harass, defame, or conduct surveillance on companies or individuals.',
      'Do not attempt to abuse, overload, or reverse-engineer access controls of the platform.',
    ],
  },
  {
    title: '4. Job data',
    body: [
      'Job postings are aggregated from public career pages, feeds, and job-board APIs. Listings may be outdated or inaccurate; always verify on the original posting (linked from every job card).',
      'TJSR is not affiliated with the companies whose postings it indexes.',
    ],
  },
  {
    title: '5. Accounts and termination',
    body: [
      'Sign-in is via Google (Firebase Authentication). Accounts used to abuse the platform may be disabled.',
      'You can stop using TJSR at any time; see the Privacy Policy for data deletion.',
    ],
  },
  {
    title: '6. Changes',
    body: [
      'These terms may change as the project evolves; continued use after changes constitutes acceptance.',
    ],
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />
      <section className="pt-36 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">Terms &amp; Conditions</h1>
          <p className="text-gray-500 text-sm mb-10">Last updated: 3 July 2026</p>

          {sections.map(s => (
            <div key={s.title} className="mb-8">
              <h2 className="text-xl font-semibold mb-3 text-yellow-400">{s.title}</h2>
              <ul className="space-y-2">
                {s.body.map((line, i) => (
                  <li key={i} className="text-gray-300 text-sm leading-relaxed pl-4 border-l border-yellow-400/20">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <p className="text-gray-400 text-sm mt-12">
            See also the <Link href="/privacy" className="text-yellow-400 underline">Privacy Policy</Link>.
          </p>
        </div>
      </section>
      <Footer />
    </main>
  );
}
