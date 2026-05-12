'use client';

import { useEffect, useState } from 'react';
import { getPdf } from '@/lib/pdf-store';

interface PdfModalProps {
  filename: string;
  title?: string;
  onClose: () => void;
}

export default function PdfModal({ filename, title, onClose }: PdfModalProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let blobUrl: string | null = null;
    getPdf(filename).then(data => {
      if (data) {
        blobUrl = URL.createObjectURL(new Blob([data.buffer as ArrayBuffer], { type: 'application/pdf' }));
        setUrl(blobUrl);
      } else {
        setNotFound(true);
      }
      setLoading(false);
    }).catch(() => { setNotFound(true); setLoading(false); });

    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [filename]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white flex-shrink-0">
        <p className="text-sm font-medium truncate flex-1">{title || filename}</p>
        <div className="flex items-center gap-3 ml-3">
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-300 hover:text-blue-100"
            >
              Full screen ↗
            </a>
          )}
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-white bg-transparent border-0 text-2xl leading-none p-0"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center h-full text-gray-400">
            Loading chart…
          </div>
        )}
        {notFound && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4 p-8 text-center">
            <p className="text-4xl">📄</p>
            <p className="text-lg font-medium text-gray-200">PDF not stored yet</p>
            <p className="text-sm">Import your forScore backup (.4sb) in Settings to view charts here.</p>
            <button onClick={onClose} className="mt-4 bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded">
              Close
            </button>
          </div>
        )}
        {url && (
          <iframe
            src={url}
            className="w-full h-full border-0"
            title={filename}
          />
        )}
      </div>
    </div>
  );
}
