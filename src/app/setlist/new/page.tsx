'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSetlist } from '@/lib/data';

export default function NewSetlistPage() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSubmit() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const data = createSetlist(text) as any;
      if (!data) {
        setError('Failed to create setlist');
      } else {
        router.push(`/setlist/${data.id}`);
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-2xl p-6 h-full overflow-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-1">New Setlist</h1>
      <p className="text-sm text-zinc-500 mb-5">
        Paste your setlist below. The first line becomes the setlist name.
        Each following line is a song. Duplicates are allowed.
      </p>

      <div className="panel p-4 mb-4 text-xs text-zinc-400">
        <p className="font-semibold text-zinc-300 uppercase tracking-wider text-[10px] mb-2">Example</p>
        <pre className="font-mono text-zinc-400 leading-relaxed">
{`Wedding Dinner 12 May
1. Yidden
2. Vezakeni
3. All Night Long
4. Vezakeni`}
        </pre>
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Paste your setlist here..."
        rows={12}
        className="w-full font-mono text-sm"
      />

      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}

      <div className="flex gap-2 mt-4">
        <button
          onClick={handleSubmit}
          disabled={loading || !text.trim()}
          className="btn-primary disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Create Setlist & Match'}
        </button>
      </div>
    </div>
  );
}
