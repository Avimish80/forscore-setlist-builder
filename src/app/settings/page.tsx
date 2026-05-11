'use client';

import { useState, useEffect, useRef } from 'react';
import { importDatabaseFile, exportDatabaseFile, getDbStats, clearDatabase } from '@/lib/client-db';

export default function SettingsPage() {
  const [stats, setStats] = useState({ scores: 0, setlists: 0, aliases: 0 });
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStats(getDbStats());
  }, []);

  async function handleImportDb(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg('Importing…');
    try {
      const buffer = await file.arrayBuffer();
      await importDatabaseFile(new Uint8Array(buffer));
      const newStats = getDbStats();
      setStats(newStats);
      setImportMsg(`Imported: ${newStats.scores} scores, ${newStats.setlists} setlists, ${newStats.aliases} aliases.`);
    } catch (err: any) {
      setImportMsg(`Import failed: ${err.message}`);
    }
  }

  function handleExportDb() {
    const data = exportDatabaseFile();
    if (!data) return;
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'forscore-library.db';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleClearDb() {
    if (!confirm('This will delete ALL data (scores, setlists, aliases). Are you sure?')) return;
    if (!confirm('Really? This cannot be undone.')) return;
    await clearDatabase();
    window.location.reload();
  }

  return (
    <div className="max-w-lg p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Database</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-blue-600">{stats.scores}</p>
            <p className="text-xs text-gray-500">Scores</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{stats.setlists}</p>
            <p className="text-xs text-gray-500">Setlists</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-purple-600">{stats.aliases}</p>
            <p className="text-xs text-gray-500">Aliases</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">Data is stored locally on this device.</p>
      </div>

      <div className="space-y-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-700">Import / Export</h2>
        <div className="flex gap-3">
          <button onClick={() => fileRef.current?.click()} className="bg-blue-600 hover:bg-blue-700 text-white text-sm">
            Import Database
          </button>
          <button onClick={handleExportDb} className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm">
            Export Database
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".db,.sqlite,.sqlite3" className="hidden" onChange={handleImportDb} />
        <p className="text-xs text-gray-500">
          Import a <code>.db</code> file to load your score library. Export saves a copy for other devices.
        </p>
        {importMsg && (
          <p className={`text-sm ${importMsg.includes('failed') ? 'text-red-600' : 'text-green-600'}`}>{importMsg}</p>
        )}
      </div>

      <hr className="my-6" />

      <div className="mb-6">
        <h2 className="text-sm font-semibold text-red-600 mb-2">Danger Zone</h2>
        <button onClick={handleClearDb} className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm">
          Clear All Data
        </button>
      </div>

      <hr className="my-6" />

      <div>
        <h2 className="text-lg font-semibold mb-2">About</h2>
        <p className="text-sm text-gray-600 mb-2">
          forScore Setlist Builder helps you manage your PDF score library and generate .4ss setlist files.
        </p>
        <p className="text-sm text-gray-500">
          Install on iPad: tap Share → Add to Home Screen.
        </p>
      </div>
    </div>
  );
}
