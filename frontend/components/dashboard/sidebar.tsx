'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home, Briefcase, Zap, Settings, FileText, Bug, LogOut,
  MessageSquare, Network, BotMessageSquare,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Image from 'next/image';
import { useSidebar } from '@/lib/sidebar-context';

const navItems = [
  { icon: Home,             label: 'Dashboard',       href: '/dashboard' },
  { icon: Briefcase,        label: 'Job Listings',     href: '/dashboard/jobs' },
  { icon: Zap,              label: 'Scraper Control',  href: '/dashboard/scraper' },
  { icon: MessageSquare,    label: 'Bot Control',      href: '/dashboard/bot' },
  { icon: BotMessageSquare, label: 'AI Chat',          href: '/dashboard/chat' },
  { icon: Network,          label: 'Knowledge Graph',  href: '/dashboard/graph' },
  { icon: FileText,         label: 'Resume Analyzer',  href: '/dashboard/resume' },
  { icon: Bug,              label: 'Debug Logs',       href: '/dashboard/debug' },
  { icon: Settings,         label: 'Settings',         href: '/dashboard/settings' },
];

export function Sidebar() {
  const pathname              = usePathname();
  const router                = useRouter();
  const { collapsed, toggle } = useSidebar();

  const isActive = (href: string) => pathname === href;

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/auth');
  };

  return (
    <>
      {/* Sidebar panel — desktop only */}
      <div className={`fixed left-0 top-0 h-screen
                       border-r overflow-y-auto overflow-x-hidden
                       transform transition-all duration-300 z-30
                       ${collapsed ? 'w-16' : 'w-64'}`}
           style={{ backgroundColor: 'var(--nav-bg)', borderColor: 'var(--nav-border)', backdropFilter: 'blur(16px)' }}>

        {/* Top header: collapse toggle + logo */}
        <div className={`flex flex-col items-center pt-[72px] px-3 mb-4 ${collapsed ? 'gap-3' : ''}`}>
          {collapsed ? (
            <>
              <button
                onClick={toggle}
                className="hidden md:flex items-center justify-center w-8 h-8 rounded-xl transition-all"
                style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                title="Expand sidebar">
                <ChevronRight size={15} />
              </button>
              <Link href="/dashboard">
                <Image src="/icon.svg" alt="TJSR" width={28} height={28} className="w-7 h-7" />
              </Link>
            </>
          ) : (
            <div className="flex items-center justify-between w-full">
              <Link href="/dashboard">
                <Image src="/TJSR.png" alt="TJSR" width={400} height={120} className="w-40 h-auto object-contain" priority />
              </Link>
              <button
                onClick={toggle}
                className="hidden md:flex items-center justify-center w-8 h-8 rounded-xl transition-all flex-shrink-0 ml-2"
                style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                title="Collapse sidebar">
                <ChevronLeft size={15} />
              </button>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="space-y-1 px-2 mb-8">
          {navItems.map((item) => {
            const Icon   = item.icon;
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} // mobile handled by bottom bar
                title={collapsed ? item.label : undefined}
                className={`flex items-center rounded-xl text-sm font-medium transition-all duration-150
                            ${collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'}`}
                style={active ? {
                  backgroundColor: 'rgba(250,204,21,0.12)',
                  color: '#FACC15',
                  border: '1px solid rgba(250,204,21,0.25)',
                } : {
                  color: 'var(--text-muted)',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(250,204,21,0.08)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-main)'; }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.backgroundColor = ''; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; } }}>
                <Icon size={17} className="flex-shrink-0" />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="pt-4 px-2" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
            className={`w-full flex items-center rounded-xl text-sm font-medium transition-colors
                        ${collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'}`}
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(239,68,68,0.08)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}>
            <LogOut size={17} className="flex-shrink-0" />
            {!collapsed && 'Logout'}
          </button>
        </div>
      </div>
    </>
  );
}
