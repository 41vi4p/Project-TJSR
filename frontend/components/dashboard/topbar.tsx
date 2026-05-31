'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell, Search, Settings, LogOut, ChevronDown,
  Menu, X, Zap, FileText, Bug, Home, Briefcase,
  Sun, Moon, MessageSquare, Network, BotMessageSquare,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const primaryNavItems = [
  { label: 'Dashboard', href: '/dashboard',          icon: Home },
  { label: 'Jobs',      href: '/dashboard/jobs',     icon: Briefcase },
  { label: 'Resume',    href: '/dashboard/resume',   icon: FileText },
];

const toolsItems = [
  { label: 'AI Chat',        href: '/dashboard/chat',     icon: BotMessageSquare },
  { label: 'Bot Control',    href: '/dashboard/bot',      icon: MessageSquare },
  { label: 'Knowledge Graph',href: '/dashboard/graph',    icon: Network },
  { label: 'Scraper Control',href: '/dashboard/scraper',  icon: Zap },
  { label: 'Debug Logs',     href: '/dashboard/debug',    icon: Bug },
  { label: 'Settings',       href: '/dashboard/settings', icon: Settings },
];

import { useSidebar } from '@/lib/sidebar-context';

export function Topbar() {
  const { user }          = useAuth();
  const { theme, toggle } = useTheme();
  const { collapsed }     = useSidebar();
  const router            = useRouter();
  const pathname          = usePathname();
  const isDark            = theme === 'dark';

  const [showNotif,    setShowNotif]    = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTools,    setShowTools]    = useState(false);

  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      if (!user) return [];
      const token = await (user as any).getIdToken?.();
      const resp = await fetch(`${BACKEND_URL}/api/v1/notifications`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) return [];
      return resp.json();
    },
    refetchInterval: 30000,
    enabled: !!user,
  });

  const unreadCount = (notifications as any[]).filter((n) => !n.is_read).length;

  const markAllRead = useMutation({
    mutationFn: async () => {
      const token = await (user as any)?.getIdToken?.();
      await fetch(`${BACKEND_URL}/api/v1/notifications/mark-all-read`, {
        method: 'PUT',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const token = await (user as any)?.getIdToken?.();
      await fetch(`${BACKEND_URL}/api/v1/notifications/${id}/read`, {
        method: 'PUT',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef    = useRef<HTMLDivElement>(null);
  const toolsRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false);
      if (notifRef.current    && !notifRef.current.contains(e.target as Node))    setShowNotif(false);
      if (toolsRef.current    && !toolsRef.current.contains(e.target as Node))    setShowTools(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSignOut = async () => { await signOut(auth); router.push('/auth'); };

  const initials = user?.displayName
    ? user.displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? 'U';

  const isActive = (href: string) => pathname === href;

  const navBg    = 'var(--nav-bg)';
  const navBrd   = 'var(--nav-border)';
  const cardBg   = 'var(--card-bg)';
  const inputBg  = 'var(--input-bg)';
  const brd      = 'var(--border)';
  const txtMain  = 'var(--text-main)';
  const txtMuted = 'var(--text-muted)';

  return (
    <>
      {/* ── TOPBAR ── */}
      <nav className={`fixed top-0 right-0 h-16 z-40 px-4 md:px-6 flex items-center gap-3
                      backdrop-blur-xl border-b shadow-sm transition-all duration-300
                      ${collapsed ? 'left-0 md:left-16' : 'left-0 md:left-64'}`}
           style={{ backgroundColor: navBg, borderColor: navBrd }}>

        {/* Search */}
        <div className="hidden md:flex flex-1 max-w-xs">
          <div className="relative w-full">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: txtMuted }} />
            <input
              type="text"
              placeholder="Search jobs, companies…"
              className="w-full h-9 rounded-xl pl-9 pr-4 text-sm focus:outline-none
                         focus:ring-2 focus:ring-yellow-300/40 transition-all duration-200"
              style={{ backgroundColor: inputBg, border: `1px solid ${brd}`, color: txtMain }}
            />
          </div>
        </div>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-0.5 ml-auto">
          {primaryNavItems.map(item => (
            <Link key={item.href} href={item.href}
              className={`relative px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive(item.href) ? 'bg-yellow-100/20' : 'hover:bg-yellow-100/10'
              }`}
              style={{ color: isActive(item.href) ? '#FACC15' : txtMuted }}>
              {isActive(item.href) && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-yellow-400 rounded-full" />
              )}
              {item.label}
            </Link>
          ))}

          {/* Tools dropdown */}
          <div className="relative" ref={toolsRef}>
            <button onClick={() => setShowTools(v => !v)}
              className="flex items-center gap-1 px-3.5 py-2 rounded-xl text-sm font-medium
                         hover:bg-yellow-100/10 transition-all duration-150"
              style={{ color: txtMuted }}>
              Tools
              <ChevronDown size={12} className={`transition-transform duration-200 ${showTools ? 'rotate-180' : ''}`} />
            </button>
            {showTools && (
              <div className="absolute right-0 mt-2 w-52 rounded-2xl py-2 z-50 shadow-xl animate-slide-up"
                   style={{ backgroundColor: cardBg, border: `1px solid ${brd}` }}>
                {toolsItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setShowTools(false)}
                      className="flex items-center gap-3 px-4 py-2.5 mx-1.5 rounded-xl text-sm
                                 transition-colors hover:bg-yellow-100/10"
                      style={{ color: txtMain }}>
                      <Icon size={14} style={{ color: txtMuted }} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">

          {/* Dark mode toggle */}
          <button onClick={toggle}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-yellow-100/10 transition-all duration-150"
            style={{ color: txtMuted }}
            title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? <Sun size={17} className="text-yellow-400" /> : <Moon size={17} />}
          </button>

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button onClick={() => setShowNotif(v => !v)}
              className="relative w-9 h-9 flex items-center justify-center rounded-xl
                         hover:bg-yellow-100/10 transition-all duration-150"
              style={{ color: txtMuted }}>
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-yellow-400 rounded-full" />
              )}
            </button>
            {showNotif && (
              <div className="absolute right-0 mt-2.5 w-[340px] rounded-2xl z-50 shadow-xl animate-slide-up overflow-hidden"
                   style={{ backgroundColor: cardBg, border: `1px solid ${brd}` }}>
                <div className="px-4 pt-4 pb-3 flex items-center justify-between"
                     style={{ borderBottom: `1px solid ${brd}` }}>
                  <div>
                    <h3 className="text-sm font-semibold" style={{ color: txtMain }}>Notifications</h3>
                    <p className="text-xs mt-0.5" style={{ color: txtMuted }}>{unreadCount} unread</p>
                  </div>
                  <button onClick={() => markAllRead.mutate()}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg hover:bg-yellow-100/10 transition-colors"
                    style={{ color: '#FACC15' }}>
                    Mark all read
                  </button>
                </div>
                <div className="p-2 space-y-0.5 max-h-[340px] overflow-y-auto">
                  {(notifications as any[]).length > 0 ? (
                    (notifications as any[]).map((n) => (
                      <div key={n.id}
                           onClick={() => { if (!n.is_read) markRead.mutate(n.id); }}
                           className="flex items-start gap-3 p-3 rounded-xl transition-colors cursor-pointer hover:bg-yellow-100/10">
                        <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.is_read ? 'bg-gray-300' : 'bg-yellow-400'}`} />
                        <div>
                          <p className={`text-sm leading-snug ${n.is_read ? '' : 'font-medium'}`}
                             style={{ color: n.is_read ? txtMuted : txtMain }}>
                            {n.title}: {n.message}
                          </p>
                          <p className="text-[10px] mt-1" style={{ color: txtMuted }}>
                            {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center text-xs" style={{ color: txtMuted }}>No notifications yet</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User menu */}
          <div className="relative" ref={userMenuRef}>
            <button onClick={() => setShowUserMenu(v => !v)}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-yellow-100/10 transition-all duration-150">
              {user?.photoURL ? (
                <Image src={user.photoURL} alt={user.displayName ?? 'Profile'}
                  width={30} height={30} className="rounded-full ring-2 ring-yellow-400/40"
                  referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center select-none"
                     style={{ backgroundColor: '#FFF3C4', color: '#B45309' }}>
                  {initials}
                </div>
              )}
              <ChevronDown size={12} className="hidden md:block" style={{ color: txtMuted }} />
            </button>
            {showUserMenu && (
              <div className="absolute right-0 mt-2.5 w-60 rounded-2xl z-50 shadow-xl overflow-hidden animate-slide-up"
                   style={{ backgroundColor: cardBg, border: `1px solid ${brd}` }}>
                <div className="px-4 py-3.5" style={{ borderBottom: `1px solid ${brd}` }}>
                  <p className="text-sm font-semibold truncate" style={{ color: txtMain }}>{user?.displayName ?? 'User'}</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: txtMuted }}>{user?.email}</p>
                </div>
                <div className="p-1.5">
                  <Link href="/dashboard/settings" onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl hover:bg-yellow-100/10 transition-colors"
                    style={{ color: txtMain }}>
                    <Settings size={14} style={{ color: txtMuted }} />
                    Settings
                  </Link>
                  <button onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl text-red-400 hover:bg-red-500/10 transition-colors">
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile hamburger hidden — bottom bar handles mobile nav */}
        </div>
      </nav>
    </>
  );
}
