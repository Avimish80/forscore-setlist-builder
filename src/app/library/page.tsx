'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Score } from '@/lib/types';
import { queryScores, updateScore, importScoresFromFiles, createAlias, getSetlists, addSetlistItem, createSetlist } from '@/lib/data';
import InlinePdfViewer from '@/components/InlinePdfViewer';
import StatusBadge from '@/components/StatusBadge';

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
  const router = useRouter();
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

  // Selected score — PDF loads automatically when this changes
  const [selected, setSelected] = useState<Score | null>(null);
  const [editFields, setEditFields] = useState<Partial<Score>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [editMode, setEditMode] = useState(false); // persistent edit mode — form always shows when active

  const [aliasModal, setAliasModal] = useState<Score | null>(null);
  const [aliasText, setAliasText] = useState('');

  // "Add to Setlist" picker
  const [setlistPicker, setSetlistPicker] = useState(false);
  const [allSetlists, setAllSetlists] = useState<{ id: number; name: string }[]>([]);
  const [addedMsg, setAddedMsg] = useState<{ text: string; link: string } | null>(null);
  const [newSetlistMode, setNewSetlistMode] = useState(false);
  const [newSetlistName, setNewSetlistName] = useState('');
  const newSetlistInputRef = useRef<HTMLInputElement>(null);

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

  function handleSelect(score: Score) {
    setSelected(score);
    setEditFields({
      display_title: score.display_title,
      forscore_path: score.forscore_path,
      detected_key: score.detected_key || '',
      version_label: score.version_label || '',
      status: score.status,
      notes: score.notes || '',
    });
    setSavedMsg(false);
    // In edit mode the form stays open; otherwise collapse on new selection
  }

  function handleSave() {
    if (!selected) return;
    setSaving(true);
    const updated = updateScore(selected.id, editFields);
    if (updated) {
      setScores(prev => prev.map(s => s.id === selected.id ? updated : s));
      setSelected(updated);
    }
    setSaving(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
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

  // Load setlists whenever the picker opens
  useEffect(() => {
    if (setlistPicker) setAllSetlists(getSetlists() as { id: number; name: string }[]);
  }, [setlistPicker]);

  // Focus the new-setlist name input when that mode activates
  useEffect(() => {
    if (newSetlistMode) setTimeout(() => newSetlistInputRef.current?.focus(), 50);
  }, [newSetlistMode]);

  function closePicker() {
    setSetlistPicker(false);
    setNewSetlistMode(false);
    setNewSetlistName('');
  }

  function handleAddToSetlist(setlistId: number, setlistName: string) {
    if (!selected) return;
    addSetlistItem(setlistId, { score_id: selected.id });
    setAddedMsg({ text: `Added to "${setlistName}"`, link: `/setlist/${setlistId}` });
    closePicker();
    setTimeout(() => setAddedMsg(null), 5000);
  }

  function handleCreateAndAdd() {
    if (!selected || !newSetlistName.trim()) return;
    const text = `${newSetlistName.trim()}\n${selected.display_title}`;
    const newSl = createSetlist(text) as any;
    if (newSl) {
      setAddedMsg({ text: `Created "${newSetlistName.trim()}"`, link: `/setlist/${newSl.id}` });
    }
    closePicker();
    setTimeout(() => setAddedMsg(null), 5000);
  }

  const showPagination = !activeLetter && !search && totalPages > 1;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: score list (38%) ──────────────────────────────────────── */}
      <div className="flex flex-col w-[38%] min-w-[280px] border-r overflow-hidden">

        {/* Search + filter strip */}
        <div className="flex-shrink-0 p-3 border-b bg-white space-y-2">
          <div className="flex gap-2 items-center">
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
              className="text-xs w-24"
            >
              <option value="">All</option>
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
              <option value="unknown">Unknown</option>
              <option value="duplicate">Duplicate</option>
              <option value="ignored">Ignored</option>
            </select>
          </div>

          {/* A–Z strip */}
          <div className="flex flex-wrap gap-0.5">
            <button
              onClick={() => { setActiveLetter(''); setSearch(''); }}
              className={`px-1.5 py-0.5 rounded text-xs font-medium ${!activeLetter && !search ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
            >
              All
            </button>
            {LETTERS.map(l => (
              <button
                key={l}
                onClick={() => handleLetterClick(l)}
                className={`px-1.5 py-0.5 rounded text-xs font-medium min-w-[1.4rem] text-center ${activeLetter === l ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Import drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`rounded p-2 border-2 border-dashed text-xs transition-colors ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}
          >
            <span className="text-gray-500">
              Drop PDFs or{' '}
              <button onClick={() => fileInputRef.current?.click()} title="Open file picker to select PDF score files to import" className="text-blue-600 hover:underline bg-transparent p-0 text-xs">
                browse
              </button>
            </span>
            {importResult && <p className="text-green-600 mt-0.5">{importResult}</p>}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={e => e.target.files && handleImportFiles(e.target.files)}
            />
          </div>

          <p className="text-xs text-gray-400">{loading ? '…' : `${total} scores`}</p>
        </div>

        {/* Score list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-gray-400 text-sm p-4">Loading…</p>
          ) : total === 0 && !search && !statusFilter && !activeLetter ? (
            <div className="text-center py-12 text-gray-400 px-4">
              <p className="text-lg mb-1">No scores yet</p>
              <p className="text-sm">Drop PDF files above or import a database from Settings</p>
            </div>
          ) : scores.length === 0 ? (
            <p className="text-gray-400 text-sm p-4">No results.</p>
          ) : (
            <>
              {scores.map(score => (
                <button
                  key={score.id}
                  onClick={() => handleSelect(score)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-100 hover:bg-blue-50 transition-colors block ${
                    selected?.id === score.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent'
                  }`}
                >
                  <p className="text-sm font-medium truncate">{score.display_title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {score.detected_key && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-1 py-0.5 rounded">{score.detected_key}</span>
                    )}
                    {score.version_label && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1 py-0.5 rounded">{score.version_label}</span>
                    )}
                    <span className="text-xs text-gray-400 truncate">{score.forscore_path}</span>
                  </div>
                </button>
              ))}

              {showPagination && (
                <div className="flex items-center gap-2 p-3 text-sm border-t">
                  <button onClick={() => fetchScores(page - 1)} disabled={page === 1} title="Go to previous page" className="bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-40 px-2 py-1 text-xs">← Prev</button>
                  <span className="text-gray-400 text-xs">{start}–{end} of {total}</span>
                  <button onClick={() => fetchScores(page + 1)} disabled={page === totalPages} title="Go to next page" className="bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-40 px-2 py-1 text-xs">Next →</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right: PDF viewer + metadata (62%) ─────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Header strip — only when a score is selected */}
        {selected && (
          <>
          {/* "Added to setlist" confirmation banner */}
          {addedMsg && (
            <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-green-50 border-b border-green-200 text-green-800 text-xs">
              <span className="flex-1 font-medium">{addedMsg.text} ✓</span>
              <button
                onClick={() => router.push(addedMsg.link)}
                className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-0.5 rounded"
              >
                Open →
              </button>
              <button onClick={() => setAddedMsg(null)} className="text-green-500 hover:text-green-700 bg-transparent p-0 text-sm leading-none">✕</button>
            </div>
          )}

          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b bg-gray-50">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{selected.display_title}</p>
              <p className="text-xs text-gray-400 truncate">{selected.forscore_path}</p>
            </div>
            {selected.detected_key && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded flex-shrink-0">{selected.detected_key}</span>
            )}
            {selected.version_label && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded flex-shrink-0">{selected.version_label}</span>
            )}

            {/* Add to Setlist button + popover */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => { setSetlistPicker(v => !v); setNewSetlistMode(false); setNewSetlistName(''); }}
                title="Add this score to one of your setlists, or create a new setlist"
                className={`text-xs px-2.5 py-1 rounded ${setlistPicker ? 'bg-green-600 text-white' : 'bg-green-100 hover:bg-green-200 text-green-700'}`}
              >
                + Setlist
              </button>

              {setlistPicker && (
                <>
                  {/* Invisible click-outside overlay */}
                  <div className="fixed inset-0 z-30" onClick={closePicker} />
                  {/* Popover */}
                  <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-2xl z-40 overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                      <p className="text-xs font-semibold text-gray-600">Add to setlist</p>
                    </div>

                    {/* Existing setlists */}
                    <div className="max-h-48 overflow-y-auto">
                      {allSetlists.length === 0 ? (
                        <p className="text-xs text-gray-400 px-3 py-3 text-center">No setlists yet</p>
                      ) : (
                        allSetlists.map(sl => (
                          <button
                            key={sl.id}
                            onClick={() => handleAddToSetlist(sl.id, sl.name)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 bg-transparent border-0 border-b border-gray-50 flex items-center gap-2"
                          >
                            <span className="flex-1 truncate">{sl.name}</span>
                            <span className="text-blue-500 text-xs flex-shrink-0">+ Add</span>
                          </button>
                        ))
                      )}
                    </div>

                    {/* New setlist section */}
                    <div className="border-t border-gray-100 px-3 py-2">
                      {!newSetlistMode ? (
                        <button
                          onClick={() => setNewSetlistMode(true)}
                          className="w-full text-left text-xs text-gray-500 hover:text-green-700 bg-transparent border-0 p-0 flex items-center gap-1"
                        >
                          <span className="text-base leading-none">＋</span> Create new setlist with this song
                        </button>
                      ) : (
                        <div className="flex gap-1.5">
                          <input
                            ref={newSetlistInputRef}
                            type="text"
                            placeholder="Setlist name…"
                            value={newSetlistName}
                            onChange={e => setNewSetlistName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleCreateAndAdd();
                              if (e.key === 'Escape') setNewSetlistMode(false);
                            }}
                            className="flex-1 text-xs"
                          />
                          <button
                            onClick={handleCreateAndAdd}
                            disabled={!newSetlistName.trim()}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 disabled:opacity-40"
                          >
                            Create
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setEditMode(v => !v)}
              title={editMode ? 'Exit edit mode — click to stop editing scores' : 'Enter edit mode — click any score to edit its title, key, instrument, and status'}
              className={`text-xs px-2.5 py-1 rounded flex-shrink-0 ${editMode ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
            >
              {editMode ? 'Editing ✎' : 'Edit'}
            </button>
            <button
              onClick={() => { setSelected(null); setEditMode(false); closePicker(); }}
              title="Close the viewer and go back to browsing"
              className="text-gray-400 hover:text-gray-700 bg-transparent text-lg leading-none flex-shrink-0"
            >
              ✕
            </button>
          </div>
          </>
        )}

        {/* PDF viewer — fills remaining space */}
        <div className="flex-1 overflow-hidden">
          <InlinePdfViewer
            filename={selected?.forscore_path ?? null}
            placeholder={
              <div className="text-center text-gray-500">
                <p className="text-5xl mb-4">🎵</p>
                <p className="text-sm font-medium">Select a score</p>
                <p className="text-xs mt-1 text-gray-400">Tap any song in the list to view its chart</p>
              </div>
            }
          />
        </div>

        {/* Metadata edit form — shown when edit mode is active */}
        {selected && editMode && (
          <div className="flex-shrink-0 border-t bg-gray-50 p-3">
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-0.5">Display Title</label>
                <input
                  type="text"
                  value={editFields.display_title || ''}
                  onChange={e => setEditFields(f => ({ ...f, display_title: e.target.value }))}
                  className="w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-0.5">Status</label>
                <select
                  value={editFields.status || 'new'}
                  onChange={e => setEditFields(f => ({ ...f, status: e.target.value as Score['status'] }))}
                  className="w-full text-sm"
                >
                  <option value="new">New</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="unknown">Unknown</option>
                  <option value="duplicate">Duplicate</option>
                  <option value="ignored">Ignored</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-0.5">Key</label>
                <select
                  value={editFields.detected_key || ''}
                  onChange={e => setEditFields(f => ({ ...f, detected_key: e.target.value }))}
                  className="w-full text-sm"
                >
                  {KEYS.map(k => <option key={k} value={k}>{k || '— not set —'}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-0.5">Instrument</label>
                <select
                  value={editFields.version_label || ''}
                  onChange={e => setEditFields(f => ({ ...f, version_label: e.target.value }))}
                  className="w-full text-sm"
                >
                  {INSTRUMENTS.map(i => <option key={i} value={i === 'Generic' ? '' : i}>{i}</option>)}
                </select>
              </div>
            </div>

            {/* Notes — full-width, separate from the metadata grid */}
            <div className="border-t border-gray-200 pt-2 mt-1 mb-2">
              <label className="block text-xs font-medium text-gray-500 mb-0.5">Notes / Comments</label>
              <textarea
                value={editFields.notes || ''}
                onChange={e => setEditFields(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. who this is for, special instructions, reminders…"
                rows={2}
                className="w-full text-sm resize-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                title="Save changes to this score's metadata"
                className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 text-sm px-4 py-1.5"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setAliasModal(selected)}
                title="Add an alternate name for this score — useful when a setlist uses a different title"
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm px-3 py-1.5"
              >
                + Alias
              </button>
              {savedMsg && <span className="text-green-600 text-sm">Saved ✓</span>}
            </div>
          </div>
        )}
      </div>

      {/* ── Alias modal ─────────────────────────────────────────────────── */}
      {aliasModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setAliasModal(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-2">Add Alias</h2>
            <p className="text-sm text-gray-500 mb-3">For: <strong>{aliasModal.display_title}</strong></p>
            <input
              type="text"
              placeholder="Alias text"
              value={aliasText}
              onChange={e => setAliasText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddAlias(); }}
              className="w-full mb-4"
              autoFocus
            />
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
