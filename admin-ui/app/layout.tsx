import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';
import { QueryProvider } from '@/components/query-provider';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'TJSR Admin',
  description: 'Local admin panel for TJSR scraper and bot control',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <QueryProvider>
              {children}
              <Toaster richColors />
            </QueryProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
