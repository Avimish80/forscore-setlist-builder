import type { Metadata, Viewport } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import { DbProvider } from '@/components/DbProvider';

export const metadata: Metadata = {
  title: 'forScore Setlist Builder',
  description: 'Build setlists from your existing forScore library',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Setlists',
  },
};

export const viewport: Viewport = {
  themeColor: '#111827',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="flex h-screen overflow-hidden bg-white">
        <DbProvider>
          <Sidebar />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </DbProvider>
      </body>
    </html>
  );
}
