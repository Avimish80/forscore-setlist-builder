'use client';

import { useState, useEffect, useRef } from 'react';
import { importDatabaseFile, exportDatabaseFile, getDbStats, clearDatabase } from '@/lib/client-db';
import { import4sb, ImportProgress } from '@/lib/parse-4sb';
import { getPdfCount, clearPdfs, listPdfFilenames } from '@/lib/pdf-store';
import { rebuildLibraryFromFilenames } from '@/lib/data';

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
      const result = await import4sb(buffer, (p) => {
        setBackupProgress(p);
        setBackupMsg(`Extracting: ${p.done} / ${p.total}`);
      });
      setBackupMsg(
        `Done! ${result.pdfs} PDFs imported, ${result.scoresAdded} new scores added` +
        (result.scoresSkipped > 0 ? `, ${result.scoresSkipped} already in library.` : '.')
      );
      setBackupProgress(null);
      setStats(getDbStats());
      const newPdfCount = await getPdfCount();
      setPdfCount(newPdfCount);
    } catch (err: any) {
      setBackupMsg(`Import failed: ${err.message}`);
      setBackupProgress(null);
    }
    if (backupRef.current) backupRef.current.value = '';
  }

  async function handleRebuildLibrary() {
    setBackupMsg('Rebuilding library from stored PDFs…');
    try {
      const filenames = await listPdfFilenames();
      const { added, skipped } = rebuildLibraryFromFilenames(filenames);
      setStats(getDbStats());
      setBackupMsg(`Library rebuilt: ${added} scores added, ${skipped} already present.`);
    } catch (err: any) {
      setBackupMsg(`Rebuild failed: ${err.message}`);
    }
  }

  async function handleClearDb() {
    if (!confirm('This will delete ALL data (scores, setlists, aliases). Are you sure?')) return;
    if (!confirm('Really? This cannot be undone.')) return;
    await clearDatabase();
    await clearPdfs();
    window.location.reload();
  }

  return (
    <div className="max-w-lg p-6 h-full overflow-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Settings</h1>

      <div className="panel p-5 mb-6">
        <h2 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Database</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-amber-300 tabular-nums">{stats.scores}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Scores</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-300 tabular-nums">{stats.setlists}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Setlists</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-violet-300 tabular-nums">{stats.aliases}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Aliases</p>
          </div>
        </div>
        {pdfCount > 0 && (
          <p className="text-xs text-emerald-300 mt-4">{pdfCount} PDFs stored locally</p>
        )}
        <p className="text-xs text-zinc-500 mt-1">Data is stored locally on this device.</p>
      </div>

      <div className="panel p-5 mb-6">
        <h2 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">forScore Backup (PDFs)</h2>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => backupRef.current?.click()} title="Select a .4sb forScore backup file to extract all PDF charts and add them to your library" className="btn-primary text-sm">
            Import forScore Backup (.4sb)
          </button>
          {pdfCount > 0 && stats.scores < pdfCount && (
            <button onClick={handleRebuildLibrary} title="Scan your stored PDFs and create missing score entries in the library" className="btn-secondary text-sm">
              Rebuild Library
            </button>
          )}
          {pdfCount > 0 && (
            <button
              onClick={async () => {
                if (!confirm(`Delete all ${pdfCount} stored PDFs? Setlists and aliases will be kept.`)) return;
                await clearPdfs();
                setPdfCount(0);
              }}
              title="Remove all stored PDF files from this device — score records and setlists will remain, but charts won't be viewable"
              className="btn-ghost text-sm"
            >
              Clear PDFs
            </button>
          )}
        </div>
        <input ref={backupRef} type="file" accept=".4sb" className="hidden" onChange={handleImportBackup} />
        <p className="text-xs text-zinc-500 mt-3">
          Imports all charts from a forScore backup. In forScore, tap Tools → Backup → Save, then transfer the .4sb file to your iPad and import here.
        </p>
        {backupProgress && (
          <div className="mt-3">
            <div className="w-full bg-zinc-800 rounded-full h-2.5">
              <div
                className="bg-amber-400 h-2.5 rounded-full transition-all"
                style={{ width: `${backupProgress.total ? (backupProgress.done / backupProgress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500 mt-1.5 truncate">
              {backupProgress.done} / {backupProgress.total} — {backupProgress.currentFile}
            </p>
          </div>
        )}
        {backupMsg && !backupProgress && (
          <p className={`text-sm mt-3 ${backupMsg.includes('failed') ? 'text-red-400' : 'text-emerald-300'}`}>{backupMsg}</p>
        )}
      </div>

      <div className="panel p-5 mb-6">
        <h2 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Import / Export</h2>
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()} title="Load a previously exported .db file to restore your score library on this device" className="btn-secondary text-sm">
            Import Database
          </button>
          <button onClick={handleExportDb} title="Download your score library as a .db file — use this to back up or transfer to another device" className="btn-secondary text-sm">
            Export Database
          </button>
        </div>
        <p className="text-xs text-zinc-500 mt-3">
          Import a <code className="text-zinc-400">.db</code> file to load your score library. Export saves a copy for other devices.
        </p>
        {importMsg && (
          <p className={`text-sm mt-3 ${importMsg.includes('failed') ? 'text-red-400' : 'text-emerald-300'}`}>{importMsg}</p>
        )}
        <input ref={fileRef} type="file" accept=".db,.sqlite,.sqlite3" className="hidden" onChange={handleImportDb} />
      </div>

      <div className="panel p-5 mb-6 border-red-400/20">
        <h2 className="text-[11px] font-semibold text-red-400 uppercase tracking-wider mb-3">Danger Zone</h2>
        <button onClick={handleClearDb} title="Delete all scores, setlists, aliases, and stored PDFs — this cannot be undone" className="btn-danger text-sm">
          Clear All Data
        </button>
      </div>

      <div className="px-1">
        <h2 className="text-sm font-semibold text-zinc-300 mb-2">About</h2>
        <p className="text-sm text-zinc-500 mb-2">
          forScore Setlist Builder helps you manage your PDF score library and generate .4ss setlist files.
        </p>
        <p className="text-sm text-zinc-500">
          Install on iPad: tap Share → Add to Home Screen.
        </p>
      </div>
    </div>
  );
}
