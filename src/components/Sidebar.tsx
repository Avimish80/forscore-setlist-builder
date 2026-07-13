'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useHelpMode } from '@/lib/help-context';

const NAV_ITEMS = [
  {
    href: '/library',
    label: 'Library',
    title: 'Library — browse all your score files. Tap any score to view its chart instantly. Edit titles, keys, and instruments.',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
      </svg>
    ),
  },
  {
    href: '/workbench',
    label: 'Workbench',
    title: 'Workbench — review and clean up scores in bulk. Group songs that appear in multiple versions (different keys or instruments) and set canonical names.',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M6.672 1.911a1 1 0 10-1.932.518l.259.966a1 1 0 001.932-.518l-.26-.966zM2.429 4.74a1 1 0 10-.517 1.932l.966.259a1 1 0 00.517-1.932l-.966-.26zm8.814-.569a1 1 0 00-1.415-1.414l-.707.707a1 1 0 101.415 1.415l.707-.708zm-7.071 7.072l.707-.707A1 1 0 003.465 9.12l-.708.707a1 1 0 001.415 1.415zm3.2-5.171a1 1 0 00-1.3 1.3l4 10a1 1 0 001.823.075l1.38-2.759 3.018 3.02a1 1 0 001.414-1.415l-3.019-3.02 2.76-1.379a1 1 0 00-.076-1.822l-10-4z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: '/aliases',
    label: 'Aliases',
    title: 'Aliases — manage alternate song names. When a setlist uses a different name for a score (e.g. "All Night" vs "All Night Long"), an alias links them automatically next time.',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" />
      </svg>
    ),
  },
  {
    href: '/setlists',
    label: 'Setlists',
    title: 'Setlists — build and manage setlists. View the matching chart on the right as you work. Export a .4ss file to open directly in forScore.',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    title: 'Settings — import your forScore backup (.4sb) to load all charts. Export or import the score database. Clear all data if starting fresh.',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { helpMode, toggleHelp } = useHelpMode();

  const isActive = (href: string) =>
    pathname === href ||
    pathname.startsWith(href + '/') ||
    (href === '/setlists' && pathname.startsWith('/setlist'));

  return (
    <>
    {/* ── Phone: bottom tab bar ─────────────────────────────────────────── */}
    <nav className="md:hidden order-last flex-shrink-0 flex items-stretch justify-around border-t border-zinc-800 bg-zinc-950 pb-[env(safe-area-inset-bottom)]">
      {NAV_ITEMS.map(item => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 flex-1 py-2 transition-colors ${
              active ? 'text-amber-300' : 'text-zinc-500 active:text-zinc-200'
            }`}
          >
            {item.icon}
            <span className="text-[10px] leading-tight font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>

    {/* ── Tablet / desktop: side rail ───────────────────────────────────── */}
    <aside className="hidden md:flex w-16 bg-zinc-950 border-r border-zinc-800/70 h-dvh flex-shrink-0 flex-col items-center py-3 gap-1">
      {/* Wordmark */}
      <div className="h-10 flex items-center justify-center mb-2 text-amber-400">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </div>

      {NAV_ITEMS.map(item => {
        const active = isActive(item.href);
        return (
          <div key={item.href} className="w-full px-1.5">
            <Link
              href={item.href}
              title={item.title}
              className={`flex flex-col items-center gap-0.5 w-full py-2.5 rounded-xl transition-colors ${
                active
                  ? 'bg-zinc-800/80 text-amber-300'
                  : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              {item.icon}
              <span className="text-[10px] leading-tight font-medium">{item.label}</span>
            </Link>
          </div>
        );
      })}

      {/* Spacer pushes help button to the bottom */}
      <div className="flex-1" />

      {/* Help toggle */}
      <div className="w-full px-1.5 mb-1">
        <button
          onClick={toggleHelp}
          title="Toggle help mode — highlights every button so you can hover to learn what it does"
          className={`flex flex-col items-center gap-0.5 w-full py-2.5 rounded-xl transition-colors ${
            helpMode
              ? 'bg-amber-400 text-zinc-950'
              : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200'
          }`}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <span className="text-[10px] leading-tight font-medium">Help</span>
        </button>
      </div>
    </aside>
    </>
  );
}
