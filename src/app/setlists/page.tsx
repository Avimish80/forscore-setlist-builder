'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSetlists, deleteSetlist } from '@/lib/data';

interface SetlistRow {
  id: number;
  name: string;
  created_at: string;
}

export default function SetlistsPage() {
  const [setlists, setSetlists] = useState<SetlistRow[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setSetlists(getSetlists() as SetlistRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function handleDelete(id: number) {
    if (!confirm('Delete this setlist?')) return;
    deleteSetlist(id);
    load();
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Setlists</h1>
          <Link href="/setlist/new" className="btn-primary px-4 py-2 rounded-lg text-sm inline-flex items-center gap-1.5">
            <span className="text-base leading-none">＋</span> New Setlist
          </Link>
        </div>

        {loading ? (
          <p className="text-zinc-500">Loading...</p>
        ) : setlists.length === 0 ? (
          <div className="panel py-16 text-center">
            <p className="text-zinc-300 font-medium mb-1">No setlists yet</p>
            <p className="text-zinc-500 text-sm">Create one and paste in your song list.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {setlists.map(sl => (
              <div
                key={sl.id}
                className="group flex items-center gap-4 px-4 py-3.5 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 hover:bg-zinc-800/60 transition-colors"
              >
                <Link href={`/setlist/${sl.id}`} className="flex-1 min-w-0">
                  <p className="font-medium text-zinc-100 truncate group-hover:text-amber-300 transition-colors">{sl.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{new Date(sl.created_at).toLocaleDateString('en-GB')}</p>
                </Link>
                <Link
                  href={`/setlist/${sl.id}/play`}
                  title="Perform this setlist full-screen, right now — no setup, no hub required"
                  className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0 bg-emerald-400/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/30 hover:bg-emerald-400/25 font-semibold"
                >
                  ▶ Live
                </Link>
                <Link
                  href={`/setlist/${sl.id}`}
                  title="Open this setlist to view, edit, and export it"
                  className="btn-secondary text-xs px-3 py-1.5 rounded-lg flex-shrink-0"
                >
                  Open
                </Link>
                <button
                  onClick={() => handleDelete(sl.id)}
                  title="Permanently delete this setlist"
                  className="btn-ghost hover:text-red-400 text-xs px-2 py-1.5 flex-shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
