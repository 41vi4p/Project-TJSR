'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home, Briefcase, FileText, BotMessageSquare, MoreHorizontal,
  Zap, MessageSquare, Network, Bug, Settings, LogOut, Sun, Moon, X,
} from 'lucide-react';
import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import Image from 'next/image';

const PRIMARY = [
  { icon: Home,             label: 'Home',    href: '/dashboard' },
  { icon: Briefcase,        label: 'Jobs',    href: '/dashboard/jobs' },
  { icon: FileText,         label: 'Resume',  href: '/dashboard/resume' },
  { icon: BotMessageSquare, label: 'Chat',    href: '/dashboard/chat' },
];

const MORE_ITEMS = [
  { icon: Zap,          label: 'Scraper',  href: '/dashboard/scraper' },
  { icon: MessageSquare,label: 'Bot',      href: '/dashboard/bot' },
  { icon: Network,      label: 'Graph',    href: '/dashboard/graph' },
  { icon: Bug,          label: 'Debug',    href: '/dashboard/debug' },
  { icon: Settings,     label: 'Settings', href: '/dashboard/settings' },
];

export function MobileBottomBar() {
  const pathname          = usePathname();
  const router            = useRouter();
  const { user }          = useAuth();
  const { theme, toggle } = useTheme();
  const [showMore, setShowMore] = useState(false);

  const isActive = (href: string) => pathname === href;

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/auth');
  };

  const initials = user?.displayName
    ? user.displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? 'U';

  return (
    <>
      {/* Bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around
                      h-16 border-t backdrop-blur-xl px-2"
           style={{ backgroundColor: 'var(--nav-bg)', borderColor: 'var(--nav-border)' }}>

        {PRIMARY.map(item => {
          const Icon   = item.icon;
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors"
              style={{ color: active ? '#FACC15' : 'var(--text-muted)' }}>
              <Icon size={22} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}

        {/* More button */}
        <button onClick={() => setShowMore(true)}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors"
          style={{ color: 'var(--text-muted)' }}>
          <MoreHorizontal size={22} />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      {/* More sheet */}
      {showMore && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMore(false)} />
          <div className="relative rounded-t-2xl p-4 pb-8 animate-slide-up"
               style={{ backgroundColor: 'var(--nav-bg)', borderTop: '1px solid var(--nav-border)' }}>

            {/* Handle */}
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: 'var(--border)' }} />

            {/* User info */}
            <div className="flex items-center gap-3 px-2 pb-4 mb-2"
                 style={{ borderBottom: '1px solid var(--border)' }}>
              {user?.photoURL ? (
                <Image src={user.photoURL} alt="Profile" width={36} height={36}
                  className="rounded-full ring-2 ring-yellow-400/40" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-9 h-9 rounded-full text-xs font-bold flex items-center justify-center"
                     style={{ backgroundColor: '#FFF3C4', color: '#B45309' }}>
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-main)' }}>
                  {user?.displayName ?? 'User'}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
              </div>
              <button onClick={toggle} className="ml-auto p-2 rounded-xl" style={{ color: 'var(--text-muted)' }}>
                {theme === 'dark' ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} />}
              </button>
            </div>

            {/* More nav items */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {MORE_ITEMS.map(item => {
                const Icon   = item.icon;
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href} onClick={() => setShowMore(false)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors"
                    style={{
                      backgroundColor: active ? 'rgba(250,204,21,0.12)' : 'var(--card-bg)',
                      color: active ? '#FACC15' : 'var(--text-muted)',
                      border: `1px solid ${active ? 'rgba(250,204,21,0.25)' : 'var(--border)'}`,
                    }}>
                    <Icon size={20} />
                    <span className="text-[11px] font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Sign out */}
            <button onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-red-400"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </>
  );
}
