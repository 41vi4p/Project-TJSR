'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Topbar } from '@/components/dashboard/topbar';
import { Sidebar } from '@/components/dashboard/sidebar';
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context';
import { useAuth } from '@/lib/auth-context';
import { MobileBottomBar } from '@/components/dashboard/mobile-bottom-bar';

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div className="page-bg min-h-screen">
      {/* Desktop sidebar + topbar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className="hidden md:block">
        <Topbar />
      </div>

      {/* Mobile bottom bar */}
      <MobileBottomBar />

      <main className="transition-all duration-300 pb-20 pt-4 md:pt-20"
            style={{ marginLeft: collapsed ? undefined : undefined }}>
        <div className={`max-w-7xl mx-auto px-4 md:px-6 lg:px-8 ${collapsed ? 'md:ml-16' : 'md:ml-64'}`}>
          {children}
        </div>
      </main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/auth');
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center page-bg">
        <Loader2 size={32} className="animate-spin text-yellow-400" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <DashboardContent>{children}</DashboardContent>
    </SidebarProvider>
  );
}
