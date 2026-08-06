'use client';

/**
 * Warns when the library has songs but no chart files on this device.
 *
 * The score catalog ships with the app, so every song is searchable on a fresh
 * install — but PDFs only arrive by importing a forScore backup on that
 * specific device. Without this banner the two states look identical until you
 * open a chart and hit "PDF not stored", which reads like a bug.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getDbStats } from '@/lib/client-db';
import { getPdfCount } from '@/lib/pdf-store';

export default function PdfStatusBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const scores = getDbStats().scores;
        const pdfs = await getPdfCount();
        if (!cancelled) setShow(scores > 0 && pdfs === 0);
      } catch {
        // Database not ready yet — the banner simply stays hidden.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!show) return null;

  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-amber-400/10 border-b border-amber-400/25 text-amber-200 text-xs">
      <span className="flex-1">
        <span className="font-semibold">Charts aren&rsquo;t on this device yet.</span>{' '}
        Song titles and setlists work, but the sheet music has to be imported here once.
      </span>
      <Link
        href="/settings"
        className="bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold px-2.5 py-1 rounded flex-shrink-0"
      >
        Import charts
      </Link>
      <button
        onClick={() => setShow(false)}
        title="Hide this until the next time you open the app"
        className="text-amber-300/70 hover:text-amber-100 bg-transparent p-0 text-sm leading-none flex-shrink-0"
      >
        ✕
      </button>
    </div>
  );
}
