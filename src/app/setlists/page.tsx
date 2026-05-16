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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Saved Setlists</h1>
        <Link href="/setlist/new" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm">
          New Setlist
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : setlists.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">No setlists yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {setlists.map(sl => (
              <tr key={sl.id} className="hover:bg-gray-50">
                <td>
                  <Link href={`/setlist/${sl.id}`} className="text-blue-600 hover:underline font-medium">{sl.name}</Link>
                </td>
                <td className="text-sm text-gray-500">{new Date(sl.created_at).toLocaleDateString('en-GB')}</td>
                <td>
                  <div className="flex gap-2">
                    <Link href={`/setlist/${sl.id}`} title="Open this setlist to view, edit, and export it" className="text-blue-600 hover:text-blue-800 text-xs">Review</Link>
                    <button onClick={() => handleDelete(sl.id)} title="Permanently delete this setlist" className="text-red-600 hover:text-red-800 bg-transparent px-2 py-1 text-xs">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
