'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { Loader2, Terminal } from 'lucide-react';

export default function AuthPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.replace('Firebase: ', '').replace(/\(auth\/.*\)\.?/, '').trim() : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setSubmitting(true);
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
      router.replace('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center page-bg">
      <Loader2 size={28} className="animate-spin text-yellow-400" />
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center page-bg p-4">
      <div className="brand-card dark-card w-full max-w-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-yellow-400/15 rounded-lg border theme-border">
            <Terminal size={20} className="text-yellow-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold theme-text">TJSR Admin</h1>
            <p className="text-xs theme-muted">Local Control Panel</p>
          </div>
        </div>

        <form onSubmit={handleEmail} className="space-y-4">
          <input type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)} required
            className="w-full theme-input px-4 py-2.5 rounded-lg" />
          <input type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)} required
            className="w-full theme-input px-4 py-2.5 rounded-lg" />

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button type="submit" disabled={submitting}
            className="w-full py-3 bg-[#FACC15] text-[#1F2937] rounded-lg font-semibold disabled:opacity-50 hover:shadow-lg transition-all">
            {submitting ? <Loader2 size={18} className="animate-spin mx-auto" /> : 'Sign In'}
          </button>
        </form>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t theme-border" />
          </div>
          <div className="relative flex justify-center text-xs theme-muted">
            <span className="px-2" style={{ backgroundColor: 'var(--card-bg)' }}>or</span>
          </div>
        </div>

        <button onClick={handleGoogle} disabled={submitting}
          className="w-full py-2.5 border theme-border rounded-lg theme-text text-sm font-medium hover:bg-yellow-400/8 transition-colors flex items-center justify-center gap-3 disabled:opacity-50">
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  );
}
