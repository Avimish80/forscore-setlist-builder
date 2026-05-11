'use client';

import { useEffect, useState } from 'react';
import { getPdf } from '@/lib/pdf-store';

interface PdfViewerProps {
  filename: string;
  fallback: React.ReactNode;
}

export default function PdfViewer({ filename, fallback }: PdfViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let blobUrl: string | null = null;
    setLoading(true);
    setUrl(null);

    getPdf(filename).then(data => {
      if (data) {
        blobUrl = URL.createObjectURL(new Blob([data.buffer as ArrayBuffer], { type: 'application/pdf' }));
        setUrl(blobUrl);
      }
      setLoading(false);
    }).catch(() => setLoading(false));

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [filename]);

  if (loading) {
    return (
      <div className="flex-1 overflow-hidden flex items-center justify-center bg-gray-100">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex-1 overflow-hidden flex items-center justify-center bg-gray-100">
        {fallback}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden bg-gray-100">
      <iframe
        src={url}
        className="w-full h-full border-0"
        title={filename}
      />
    </div>
  );
}
