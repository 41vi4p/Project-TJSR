'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Sidebar } from '@/components/dashboard/sidebar';
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context';
import { useAuth } from '@/lib/auth-context';

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div className="page-bg min-h-screen">
      <Sidebar />
      <main className="transition-all duration-300"
            style={{ marginLeft: collapsed ? '4rem' : '16rem', padding: '1.5rem 2rem' }}>
        {children}
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
