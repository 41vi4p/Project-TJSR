import type { Metadata } from 'next';
import Link from 'next/link';
import { Navbar } from '@/components/landing/navbar';
import { Footer } from '@/components/landing/footer';

export const metadata: Metadata = {
  title: 'Privacy Policy — TJSR',
  description: 'How TJSR collects, uses, stores, and shares your data.',
};

const sections = [
  {
    title: '1. What we collect',
    body: [
      'Account data: your name, email address, and profile photo from Firebase Authentication (Google sign-in).',
      'Resume data: when you upload a resume, we store the file in Firebase Storage and extract text, skills, and an embedding vector, stored in your user profile.',
      'API keys: if you add a Groq API key in Settings, it is stored in your Firestore user document and used only as described in section 3.',
      'Company research inputs: company names, positions, and job descriptions you submit for background checks.',
      'Usage data: standard analytics via Vercel Analytics on the public site.',
    ],
  },
  {
    title: '2. How your data is used',
    body: [
      'Resume text and skills are used to match you against job postings and to power your personal dashboard.',
      'Job descriptions you submit for a background check are used only to generate your private position analysis — they are never shared with other users.',
      'Your email is used for the email digest only if you subscribe to it.',
    ],
  },
  {
    title: '3. Your Groq API key',
    body: [
      'TJSR does not operate a shared AI backend for chat or company research. Instead, features that need a large language model use your own Groq API key.',
      'Your key is stored in your Firestore user document (users/{your-id}), protected by security rules so only you (and the TJSR backend service account) can read it.',
      'The backend reads your key exclusively to fulfil requests you initiate — an AI chat message or a company background check — and sends it only to Groq (api.groq.com) to authenticate those requests. It is never used for other users’ requests, never logged, and never included in error messages.',
      'You can remove your key at any time in Settings → API Keys, which deletes it from Firestore.',
    ],
  },
  {
    title: '4. Company background checks — what is shared',
    body: [
      'When you run a company check, the backend gathers public information about that company (its website, news, search results, public GitHub data) and generates a research report.',
      'The company report (overview, culture summary, red flags, sources) is cached and visible to every signed-in TJSR user, so the community benefits from research that has already been done. It contains only public information about the company — nothing about you.',
      'Your position analysis and any job description you pasted stay private to your account. Other users cannot see what you searched for, which roles you are applying to, or your JDs.',
      'Company reports are AI-generated summaries of public sources with citations. They can be incomplete or wrong — verify red flags via the linked sources before making decisions.',
    ],
  },
  {
    title: '5. Where data lives',
    body: [
      'Firebase (Google Cloud): authentication, Firestore database, and file storage.',
      'The TJSR backend runs on self-hosted infrastructure and processes data transiently during scraping, matching, and research; scraped page content used for research reports is not persisted.',
      'Groq: receives your prompts (and, for company checks, gathered public snippets) authenticated by your own key. See Groq’s privacy policy for their handling.',
    ],
  },
  {
    title: '6. Your controls',
    body: [
      'Delete your resume and extracted skills from the Resume page at any time.',
      'Remove your Groq API key in Settings → API Keys.',
      'To delete your account and all associated data, contact the maintainer via the GitHub repository.',
    ],
  },
  {
    title: '7. Changes',
    body: [
      'This policy may change as the project evolves. Material changes will be reflected on this page with an updated date.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />
      <section className="pt-36 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-gray-500 text-sm mb-10">Last updated: 3 July 2026</p>

          <p className="text-gray-300 mb-10">
            TJSR is an open-source job discovery platform. This page explains exactly what data the
            platform touches, where it goes, and what is shared — including how your own Groq API key
            is used for AI features. Questions? Open an issue on{' '}
            <a href="https://github.com/41vi4p/Project-TJSR" target="_blank" rel="noopener noreferrer" className="text-yellow-400 underline">GitHub</a>.
          </p>

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
            See also the <Link href="/terms" className="text-yellow-400 underline">Terms &amp; Conditions</Link>.
          </p>
        </div>
      </section>
      <Footer />
    </main>
  );
}
