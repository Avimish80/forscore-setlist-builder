'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import ScoreTable from '@/components/ScoreTable';
import { Score } from '@/lib/types';
import { queryScores, updateScore, importScoresFromFiles, createAlias } from '@/lib/data';

const LETTERS = ['#', ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'עב'];

const INSTRUMENTS = [
  'Generic', 'Lead Sheet', 'Piano', 'Piano/Vocal', 'Guitar', 'Bass',
  'Violin', 'Viola', 'Cello', 'Drums', 'Saxophone', 'Alto Sax', 'Tenor Sax',
  'Trumpet', 'Trombone', 'Flute', 'Clarinet', 'Horns', 'Strings', 'Full Score', 'Other',
];

const KEYS = [
  '', 'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Abm', 'Am', 'A#m', 'Bbm', 'Bm',
];

export default function LibraryPage() {
  const [scores, setScores] = useState<Score[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const PAGE_SIZE = 100;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeLetter, setActiveLetter] = useState('');
  const [loading, setLoading] = useState(true);

  const [importResult, setImportResult] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [viewing, setViewing] = useState<Score | null>(null);
  const [editFields, setEditFields] = useState<Partial<Score>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const [aliasModal, setAliasModal] = useState<Score | null>(null);
  const [aliasText, setAliasText] = useState('');

  const fetchScores = useCallback((p = 1) => {
    const letter = activeLetter === 'עב' ? 'he' : activeLetter;
    const data = queryScores({ search, status: statusFilter, letter, page: p, pageSize: PAGE_SIZE });
    setScores(data.scores as Score[]);
    setTotal(data.total);
    setTotalPages(data.totalPages);
    setPage(p);
    setLoading(false);
  }, [search, statusFilter, activeLetter]);

  useEffect(() => { fetchScores(1); }, [fetchScores]);

  function handleView(score: Score) {
    setViewing(score);
    setEditFields({
      display_title: score.display_title,
      forscore_path: score.forscore_path,
      detected_key: score.detected_key || '',
      version_label: score.version_label || '',
      status: score.status,
      notes: score.notes || '',
    });
    setSavedMsg(false);
  }

  function handleSave() {
    if (!viewing) return;
    setSaving(true);
    const updated = updateScore(viewing.id, editFields);
    if (updated) {
      setScores(prev => prev.map(s => s.id === viewing.id ? updated : s));
      setViewing(updated);
    }
    setSaving(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }

  function handleLetterClick(letter: string) {
    setActiveLetter(prev => prev === letter ? '' : letter);
    setSearch('');
  }

  function handleImportFiles(fileList: FileList) {
    const files = Array.from(fileList).map(f => ({ name: f.name, size: f.size }));
    const result = importScoresFromFiles(files);
    setImportResult(`Added ${result.added} scores, skipped ${result.skipped} duplicates.`);
    if (result.added > 0) fetchScores(1);
    setTimeout(() => setImportResult(null), 4000);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) handleImportFiles(e.dataTransfer.files);
  }

  function handleAddAlias() {
    if (!aliasModal || !aliasText.trim()) return;
    createAlias(aliasText, aliasModal.id);
    setAliasModal(null);
    setAliasText('');
  }

  const showPagination = !activeLetter && !search && totalPages > 1;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex gap-0 h-[calc(100vh-48px)]">

      {/* ── Left: Library list ── */}
      <div className={`flex flex-col overflow-hidden transition-all ${viewing ? 'w-[42%] border-r' : 'w-full'}`}>
        <div className="p-4 overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">Library</h1>
          </div>

          {/* Import zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`rounded-lg p-3 mb-4 border-2 border-dashed transition-colors ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}
          >
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-500 flex-1">
                Drop PDF files here to import, or{' '}
                <button onClick={() => fileInputRef.current?.click()} className="text-blue-600 hover:underline bg-transparent p-0 text-sm">
                  browse files
                </button>
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={e => e.target.files && handleImportFiles(e.target.files)}
              />
            </div>
            {importResult && (
              <p className="text-xs mt-1.5 text-green-600">{importResult}</p>
            )}
          </div>

          {/* A–Z strip */}
          <div className="flex flex-wrap gap-1 mb-3">
            <button
              onClick={() => { setActiveLetter(''); setSearch(''); }}
              className={`px-2 py-1 rounded text-xs font-medium ${!activeLetter && !search ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
            >
              All
            </button>
            {LETTERS.map(l => (
              <button
                key={l}
                onClick={() => handleLetterClick(l)}
                className={`px-2 py-1 rounded text-xs font-medium min-w-[1.6rem] ${activeLetter === l ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Search + filter */}
          <div className="flex gap-2 mb-3 items-center">
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => { setSearch(e.target.value); setActiveLetter(''); }}
              className="flex-1 text-sm"
            />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="text-sm"
            >
              <option value="">All</option>
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
              <option value="unknown">Unknown</option>
              <option value="duplicate">Duplicate</option>
              <option value="ignored">Ignored</option>
            </select>
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {loading ? '…' : `${total} scores`}
            </span>
          </div>

          {/* Table */}
          {loading ? (
            <p className="text-gray-400 text-sm">Loading…</p>
          ) : total === 0 && !search && !statusFilter && !activeLetter ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg mb-2">No scores yet</p>
              <p className="text-sm">Drop PDF files above or import a database from Settings</p>
            </div>
          ) : (
            <>
              <ScoreTable
                scores={scores}
                onEdit={handleView}
                onView={handleView}
                onAddAlias={setAliasModal}
                selectedId={viewing?.id}
                compact={!!viewing}
              />
              {showPagination && (
                <div className="flex items-center gap-2 mt-4 text-sm">
                  <button onClick={() => fetchScores(page - 1)} disabled={page === 1} className="bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-40 px-3 py-1">← Prev</button>
                  <span className="text-gray-500 text-xs">{start}–{end} of {total}</span>
                  <button onClick={() => fetchScores(page + 1)} disabled={page === totalPages} className="bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-40 px-3 py-1">Next →</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right: Score detail ── */}
      {viewing && (
        <div className="flex flex-col w-[58%] overflow-hidden bg-white">

          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50 shrink-0">
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{viewing.display_title}</p>
              <p className="text-xs text-gray-400 truncate">{viewing.original_filename}</p>
            </div>
            <button
              onClick={() => setViewing(null)}
              className="text-gray-400 hover:text-gray-700 bg-transparent text-lg leading-none ml-2 shrink-0"
            >
              ✕
            </button>
          </div>

          {/* Score info card (replaces PDF iframe for iPad compatibility) */}
          <div className="flex-1 overflow-hidden flex items-center justify-center bg-gray-100">
            <div className="text-center p-8">
              <div className="text-6xl mb-4">🎵</div>
              <p className="font-medium text-lg mb-1">{viewing.display_title}</p>
              <p className="text-sm text-gray-500 mb-4">{viewing.original_filename}</p>
              {viewing.detected_key && (
                <span className="inline-block bg-amber-100 text-amber-700 text-sm px-2 py-1 rounded mr-2">Key: {viewing.detected_key}</span>
              )}
              {viewing.version_label && (
                <span className="inline-block bg-blue-100 text-blue-700 text-sm px-2 py-1 rounded">Instrument: {viewing.version_label}</span>
              )}
              <div className="mt-6"></div>
            </div>
          </div>

          {/* Metadata editor */}
          <div className="shrink-0 border-t bg-gray-50 p-4">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Display Title</label>
                <input type="text" value={editFields.display_title || ''} onChange={e => setEditFields(f => ({ ...f, display_title: e.target.value }))} className="w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">forScore Path (filename)</label>
                <input type="text" value={editFields.forscore_path || ''} onChange={e => setEditFields(f => ({ ...f, forscore_path: e.target.value }))} className="w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Instrument</label>
                <select value={editFields.version_label || ''} onChange={e => setEditFields(f => ({ ...f, version_label: e.target.value }))} className="w-full text-sm">
                  {INSTRUMENTS.map(i => <option key={i} value={i === 'Generic' ? '' : i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Key</label>
                <select value={editFields.detected_key || ''} onChange={e => setEditFields(f => ({ ...f, detected_key: e.target.value }))} className="w-full text-sm">
                  {KEYS.map(k => <option key={k} value={k}>{k || '— not set —'}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select value={editFields.status || 'new'} onChange={e => setEditFields(f => ({ ...f, status: e.target.value as Score['status'] }))} className="w-full text-sm">
                  <option value="new">New</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="unknown">Unknown</option>
                  <option value="duplicate">Duplicate</option>
                  <option value="ignored">Ignored</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <input type="text" value={editFields.notes || ''} onChange={e => setEditFields(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes…" className="w-full text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 text-sm">
                {saving ? 'Saving…' : 'Save'}
              </button>
              {savedMsg && <span className="text-green-600 text-sm">Saved ✓</span>}
            </div>
          </div>
        </div>
      )}

      {/* Alias modal */}
      {aliasModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setAliasModal(null)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2">Add Alias</h2>
            <p className="text-sm text-gray-500 mb-3">For: <strong>{aliasModal.display_title}</strong></p>
            <input type="text" placeholder="Alias text" value={aliasText} onChange={e => setAliasText(e.target.value)} className="w-full mb-4" autoFocus />
            <div className="flex justify-end gap-2">
              <button onClick={() => setAliasModal(null)} className="bg-gray-100 hover:bg-gray-200 text-gray-700">Cancel</button>
              <button onClick={handleAddAlias} className="bg-green-600 hover:bg-green-700 text-white">Add Alias</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
