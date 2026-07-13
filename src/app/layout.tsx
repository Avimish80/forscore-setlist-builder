import type { Metadata, Viewport } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import { DbProvider } from '@/components/DbProvider';
import { HelpModeProvider } from '@/lib/help-context';
import HelpOverlay from '@/components/HelpOverlay';

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
  themeColor: '#09090b',
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
      <body className="flex h-dvh overflow-hidden bg-zinc-950">
        <HelpModeProvider>
          <DbProvider>
            <Sidebar />
            <main className="flex-1 overflow-hidden h-full">
              {children}
            </main>
          </DbProvider>
          <HelpOverlay />
        </HelpModeProvider>
      </body>
    </html>
  );
}
