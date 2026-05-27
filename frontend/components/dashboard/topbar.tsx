'use client';

import { Bell, Search, Settings, LogOut } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import Image from 'next/image';

export function Topbar() {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState(3);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/auth');
  };

  const initials = user?.displayName
    ? user.displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? 'U';

  return (
    <div className="fixed top-0 right-0 left-0 md:left-64 h-16 bg-slate-950/80 border-b border-purple-500/10 backdrop-blur-md z-20 px-4 md:px-8 flex items-center justify-between">
      {/* Search Bar */}
      <div className="hidden md:flex flex-1 max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search jobs, companies..."
            className="w-full bg-slate-900 border border-purple-500/20 rounded-lg py-2 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 smooth-transition text-sm"
          />
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center space-x-4 md:space-x-6">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg hover:bg-slate-900 smooth-transition text-gray-400 hover:text-white"
          >
            <Bell size={20} />
            {notifications > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-purple-500/20 rounded-lg shadow-lg p-4 z-50">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold">Notifications</h3>
                <button
                  onClick={() => { setNotifications(0); setShowNotifications(false); }}
                  className="text-gray-400 hover:text-white text-sm"
                >
                  Clear all
                </button>
              </div>
              {notifications > 0 ? (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-800 rounded border border-purple-500/20">
                    <p className="text-sm text-gray-200">New job match: Senior React Developer at TechCorp</p>
                    <p className="text-xs text-gray-500 mt-1">2 hours ago</p>
                  </div>
                  <div className="p-3 bg-slate-800 rounded border border-purple-500/20">
                    <p className="text-sm text-gray-200">Application status updated for Startup Inc</p>
                    <p className="text-xs text-gray-500 mt-1">5 hours ago</p>
                  </div>
                  <div className="p-3 bg-slate-800 rounded border border-purple-500/20">
                    <p className="text-sm text-gray-200">Scraper completed: 45 new jobs found</p>
                    <p className="text-xs text-gray-500 mt-1">1 day ago</p>
                  </div>
                </div>
              ) : (
                <p className="text-gray-400 text-sm">No notifications</p>
              )}
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center space-x-2 rounded-lg hover:bg-slate-900 smooth-transition p-1"
          >
            {user?.photoURL ? (
              <Image
                src={user.photoURL}
                alt={user.displayName ?? 'Profile'}
                width={36}
                height={36}
                className="rounded-full ring-2 ring-purple-500/40"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-r from-purple-600 to-blue-500 flex items-center justify-center text-white text-sm font-bold ring-2 ring-purple-500/40">
                {initials}
              </div>
            )}
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-purple-500/20 rounded-lg shadow-lg z-50 overflow-hidden">
              {/* User info */}
              <div className="px-4 py-3 border-b border-purple-500/10">
                <p className="text-white font-medium text-sm truncate">{user?.displayName ?? 'User'}</p>
                <p className="text-gray-400 text-xs truncate">{user?.email}</p>
              </div>
              <div className="py-1">
                <Link
                  href="/dashboard/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center space-x-3 px-4 py-2 text-gray-300 hover:text-white hover:bg-slate-800 smooth-transition text-sm"
                >
                  <Settings size={16} />
                  <span>Settings</span>
                </Link>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center space-x-3 px-4 py-2 text-red-400 hover:text-red-300 hover:bg-slate-800 smooth-transition text-sm"
                >
                  <LogOut size={16} />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
