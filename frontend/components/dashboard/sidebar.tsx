'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Briefcase,
  Zap,
  Settings,
  MessageSquare,
  FileText,
  Bug,
  TrendingUp,
  LogOut,
  Menu,
  X,
  BotMessageSquare,
  Network,
} from 'lucide-react';
import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

import Image from 'next/image';

const navItems = [
  { icon: Home, label: 'Dashboard', href: '/dashboard' },
  { icon: Briefcase, label: 'Job Listings', href: '/dashboard/jobs' },
  { icon: Zap, label: 'Scraper Control', href: '/dashboard/scraper' },
  { icon: MessageSquare, label: 'Bot Control', href: '/dashboard/bot' },
  { icon: BotMessageSquare, label: 'AI Chat', href: '/dashboard/chat' },
  { icon: Network, label: 'Knowledge Graph', href: '/dashboard/graph' },
  { icon: FileText, label: 'Resume Analyzer', href: '/dashboard/resume' },
  { icon: TrendingUp, label: 'Job Tracking', href: '/dashboard/tracking' },
  { icon: Bug, label: 'Debug Logs', href: '/dashboard/debug' },
  { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const isActive = (href: string) => pathname === href;

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/auth');
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 left-4 z-40 p-2 bg-slate-900 border border-purple-500/20 rounded-lg text-white"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 h-screen w-64 bg-slate-950 border-r border-purple-500/20 pt-20 px-4 overflow-y-auto transform transition-transform duration-300 md:translate-x-0 z-30 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center mb-8 px-2">
          <Image 
            src="/TJSR.png" 
            alt="TJSR Logo" 
            width={400} 
            height={120} 
            className="w-56 h-auto object-contain"
            priority
          />
        </Link>

        {/* Navigation Items */}
        <nav className="space-y-2 mb-8">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg smooth-transition ${
                  active
                    ? 'bg-gradient-to-r from-purple-600/20 to-blue-500/20 text-white border border-purple-500/30 glow-purple'
                    : 'text-gray-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="border-t border-purple-500/10 pt-4">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-slate-900 smooth-transition"
          >
            <LogOut size={20} />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </div>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 md:hidden z-20"
          onClick={() => setIsOpen(false)}
        ></div>
      )}
    </>
  );
}
