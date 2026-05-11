'use client';

import { useState, useEffect, useRef } from 'react';
import { importDatabaseFile, exportDatabaseFile, getDbStats, clearDatabase } from '@/lib/client-db';
import { import4sb, ImportProgress } from '@/lib/parse-4sb';
import { getPdfCount, clearPdfs } from '@/lib/pdf-store';

export default function SettingsPage() {
  const [stats, setStats] = useState({ scores: 0, setlists: 0, aliases: 0 });
  const [pdfCount, setPdfCount] = useState(0);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [backupProgress, setBackupProgress] = useState<ImportProgress | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStats(getDbStats());
    getPdfCount().then(setPdfCount);
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

  async function handleImportBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupMsg(`Reading ${(file.size / 1024 / 1024).toFixed(0)} MB…`);
    setBackupProgress({ total: 0, done: 0, currentFile: 'Loading file…' });
    try {
      const buffer = await file.arrayBuffer();
      setBackupProgress({ total: 0, done: 0, currentFile: 'Extracting PDFs…' });
      const count = await import4sb(buffer, (p) => {
        setBackupProgress(p);
        setBackupMsg(`Extracting PDFs: ${p.done} / ${p.total}`);
      });
      setBackupMsg(`Done! Imported ${count} PDFs.`);
      setBackupProgress(null);
      setPdfCount(count);
    } catch (err: any) {
      setBackupMsg(`Import failed: ${err.message}`);
      setBackupProgress(null);
    }
    if (backupRef.current) backupRef.current.value = '';
  }

  async function handleClearDb() {
    if (!confirm('This will delete ALL data (scores, setlists, aliases). Are you sure?')) return;
    if (!confirm('Really? This cannot be undone.')) return;
    await clearDatabase();
    await clearPdfs();
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
        {pdfCount > 0 && (
          <p className="text-xs text-green-600 mt-3">📄 {pdfCount} PDFs stored locally</p>
        )}
        <p className="text-xs text-gray-400 mt-1">Data is stored locally on this device.</p>
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

      <div className="space-y-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-700">forScore Backup</h2>
        <button onClick={() => backupRef.current?.click()} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm">
          Import forScore Backup (.4sb)
        </button>
        <input ref={backupRef} type="file" accept=".4sb" className="hidden" onChange={handleImportBackup} />
        <p className="text-xs text-gray-500">
          Import a forScore backup archive to load all your PDF charts. Creates → forScore → Backups on your iPad.
        </p>
        {backupProgress && (
          <div>
            <div className="w-full bg-gray-200 rounded-full h-3 mt-2">
              <div
                className="bg-indigo-600 h-3 rounded-full transition-all"
                style={{ width: `${backupProgress.total ? (backupProgress.done / backupProgress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{backupProgress.done} / {backupProgress.total}</p>
          </div>
        )}
        {backupMsg && !backupProgress && (
          <p className={`text-sm ${backupMsg.includes('failed') ? 'text-red-600' : 'text-green-600'}`}>{backupMsg}</p>
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
