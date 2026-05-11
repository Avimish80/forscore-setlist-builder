'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { initClientDb } from '@/lib/client-db';

const DbContext = createContext(false);

export function DbProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initClientDb()
      .then(() => setReady(true))
      .catch(err => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-red-600 text-sm">Failed to load database: {error}</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading database…</p>
        </div>
      </div>
    );
  }

  return <DbContext.Provider value={true}>{children}</DbContext.Provider>;
}

export function useDbReady() {
  return useContext(DbContext);
}
