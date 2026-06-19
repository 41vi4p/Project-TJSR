'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home, Zap, MessageSquare, Bug, Database,
  LogOut, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useSidebar } from '@/lib/sidebar-context';

const navItems = [
  { icon: Home,         label: 'Overview',        href: '/dashboard' },
  { icon: Zap,          label: 'Scraper Control',  href: '/dashboard/scraper' },
  { icon: MessageSquare,label: 'Bot & Mail',       href: '/dashboard/bot' },
  { icon: Bug,          label: 'Debug Logs',       href: '/dashboard/debug' },
  { icon: Database,     label: 'Firebase Sync',    href: '/dashboard/firebase' },
];

export function Sidebar() {
  const pathname              = usePathname();
  const router                = useRouter();
  const { collapsed, toggle } = useSidebar();

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/auth');
  };

  return (
    <div className={`fixed left-0 top-0 h-screen border-r overflow-y-auto overflow-x-hidden
                     transform transition-all duration-300 z-30 ${collapsed ? 'w-16' : 'w-64'}`}
         style={{ backgroundColor: 'var(--nav-bg)', borderColor: 'var(--nav-border)', backdropFilter: 'blur(16px)' }}>

      {/* Header */}
      <div className={`flex flex-col items-center pt-5 px-3 mb-4 ${collapsed ? 'gap-3' : ''}`}>
        {collapsed ? (
          <button onClick={toggle}
            className="flex items-center justify-center w-8 h-8 rounded-xl transition-all"
            style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <ChevronRight size={15} />
          </button>
        ) : (
          <div className="flex items-center justify-between w-full mb-2">
            <div>
              <p className="text-sm font-bold theme-text">TJSR Admin</p>
              <p className="text-xs theme-muted">Local Control Panel</p>
            </div>
            <button onClick={toggle}
              className="flex items-center justify-center w-8 h-8 rounded-xl transition-all flex-shrink-0"
              style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <ChevronLeft size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Backend status indicator */}
      {!collapsed && (
        <div className="mx-3 mb-4 px-3 py-2 rounded-lg text-xs flex items-center gap-2"
             style={{ backgroundColor: 'var(--card-bg2)', border: '1px solid var(--border)' }}>
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="theme-muted">localhost:8000</span>
        </div>
      )}

      {/* Nav */}
      <nav className="space-y-1 px-2 mb-8">
        {navItems.map(item => {
          const Icon   = item.icon;
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}
              className={`flex items-center rounded-xl text-sm font-medium transition-all duration-150
                          ${collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'}`}
              style={active ? {
                backgroundColor: 'rgba(250,204,21,0.12)',
                color: '#FACC15',
                border: '1px solid rgba(250,204,21,0.25)',
              } : { color: 'var(--text-muted)' }}
              onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(250,204,21,0.08)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-main)'; } }}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.backgroundColor = ''; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; } }}>
              <Icon size={17} className="flex-shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="pt-4 px-2" style={{ borderTop: '1px solid var(--border)' }}>
        <button onClick={handleLogout} title={collapsed ? 'Logout' : undefined}
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
  );
}
