'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/library', label: 'Library' },
  { href: '/workbench', label: 'Workbench' },
  { href: '/aliases', label: 'Aliases' },
  { href: '/setlists', label: 'Setlists' },
  { href: '/settings', label: 'Settings' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-gray-900 text-white min-h-screen p-4 flex flex-col">
      <h1 className="text-lg font-bold mb-6 px-2">forScore Setlist Builder</h1>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href
            || pathname.startsWith(item.href + '/')
            || (item.href === '/setlists' && pathname.startsWith('/setlist'));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 rounded text-sm transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
