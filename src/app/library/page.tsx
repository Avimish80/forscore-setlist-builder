'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Score } from '@/lib/types';
import { queryScores, updateScore, importScoresFromFiles, createAlias, getSetlists, addSetlistItem, createSetlist } from '@/lib/data';
import InlinePdfViewer from '@/components/InlinePdfViewer';
import StatusBadge from '@/components/StatusBadge';
import { writeMetadataToPdf } from '@/lib/pdf-metadata';

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
  const [pdfSaving, setPdfSaving] = useState(false);
  const [pdfSavedMsg, setPdfSavedMsg] = useState(false);
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

  async function handleSaveAndPdf() {
    if (!selected) return;
    // Save to app first
    handleSave();
    // Then write into the PDF file
    setPdfSaving(true);
    const ok = await writeMetadataToPdf({
      forscore_path: selected.forscore_path,
      display_title: editFields.display_title ?? selected.display_title,
      detected_key: (editFields.detected_key ?? selected.detected_key) ?? undefined,
      version_label: (editFields.version_label ?? selected.version_label) ?? undefined,
    });
    setPdfSaving(false);
    if (ok) {
      setPdfSavedMsg(true);
      setTimeout(() => setPdfSavedMsg(false), 3000);
    }
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

      {/* ── Left: score list — full width on phones, 38% on tablet/desktop ── */}
      {/* On phones the list hides once a score is picked so the PDF gets the
          whole screen; the ✕ / back button brings it back. */}
      <div className={`flex-col w-full md:w-[38%] md:min-w-[280px] border-r border-zinc-800 overflow-hidden ${selected ? 'hidden md:flex' : 'flex'}`}>

        {/* Search + filter strip */}
        <div className="flex-shrink-0 p-3 border-b border-zinc-800 bg-zinc-950 space-y-2.5">
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
              className={`px-1.5 py-0.5 rounded text-xs font-medium ${!activeLetter && !search ? 'bg-amber-400/15 text-amber-300' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 bg-transparent'}`}
            >
              All
            </button>
            {LETTERS.map(l => (
              <button
                key={l}
                onClick={() => handleLetterClick(l)}
                className={`px-1.5 py-0.5 rounded text-xs font-medium min-w-[1.4rem] text-center ${activeLetter === l ? 'bg-amber-400/15 text-amber-300' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 bg-transparent'}`}
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
            className={`rounded-lg p-2 border border-dashed text-xs transition-colors ${dragging ? 'border-amber-400/60 bg-amber-400/10' : 'border-zinc-700/70 bg-zinc-900/50'}`}
          >
            <span className="text-zinc-500">
              Drop PDFs or{' '}
              <button onClick={() => fileInputRef.current?.click()} title="Open file picker to select PDF score files to import" className="text-amber-300 hover:text-amber-200 bg-transparent p-0 text-xs">
                browse
              </button>
            </span>
            {importResult && <p className="text-emerald-400 mt-0.5">{importResult}</p>}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={e => e.target.files && handleImportFiles(e.target.files)}
            />
          </div>

          <p className="text-xs text-zinc-500 tabular-nums">{loading ? '…' : `${total} scores`}</p>
        </div>

        {/* Score list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-zinc-500 text-sm p-4">Loading…</p>
          ) : total === 0 && !search && !statusFilter && !activeLetter ? (
            <div className="text-center py-12 text-zinc-500 px-4">
              <p className="text-lg mb-1 text-zinc-300">No scores yet</p>
              <p className="text-sm">Drop PDF files above or import a database from Settings</p>
            </div>
          ) : scores.length === 0 ? (
            <p className="text-zinc-500 text-sm p-4">No results.</p>
          ) : (
            <>
              {scores.map(score => (
                <button
                  key={score.id}
                  onClick={() => handleSelect(score)}
                  className={`w-full text-left px-3 py-2.5 border-b border-zinc-800/60 transition-colors block rounded-none ${
                    selected?.id === score.id
                      ? 'bg-zinc-800/50 border-l-2 border-l-amber-400'
                      : 'border-l-2 border-l-transparent hover:bg-zinc-900'
                  }`}
                >
                  <p className="text-sm font-medium truncate text-zinc-100">{score.display_title}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {score.detected_key && <span className="chip-key">{score.detected_key}</span>}
                    {score.version_label && <span className="chip-inst">{score.version_label}</span>}
                    <span className="text-xs text-zinc-600 truncate">{score.forscore_path}</span>
                  </div>
                </button>
              ))}

              {showPagination && (
                <div className="flex items-center gap-2 p-3 text-sm border-t border-zinc-800">
                  <button onClick={() => fetchScores(page - 1)} disabled={page === 1} title="Go to previous page" className="btn-secondary disabled:opacity-40 px-2.5 py-1 text-xs">← Prev</button>
                  <span className="text-zinc-500 text-xs tabular-nums">{start}–{end} of {total}</span>
                  <button onClick={() => fetchScores(page + 1)} disabled={page === totalPages} title="Go to next page" className="btn-secondary disabled:opacity-40 px-2.5 py-1 text-xs">Next →</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right: PDF viewer + metadata — hidden on phones until a score is picked ── */}
      <div className={`flex-col flex-1 overflow-hidden ${selected ? 'flex' : 'hidden md:flex'}`}>

        {/* Header strip — only when a score is selected */}
        {selected && (
          <>
          {/* "Added to setlist" confirmation banner */}
          {addedMsg && (
            <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-emerald-400/10 border-b border-emerald-400/20 text-emerald-300 text-xs">
              <span className="flex-1 font-medium">{addedMsg.text} ✓</span>
              <button
                onClick={() => router.push(addedMsg.link)}
                className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs px-2 py-0.5 rounded"
              >
                Open →
              </button>
              <button onClick={() => setAddedMsg(null)} className="text-emerald-400/70 hover:text-emerald-200 bg-transparent p-0 text-sm leading-none">✕</button>
            </div>
          )}

          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900">
            {/* Mobile-only: back to the score list */}
            <button
              onClick={() => { setSelected(null); setEditMode(false); closePicker(); }}
              title="Back to the score list"
              className="md:hidden text-amber-300 bg-transparent border-0 p-0 pr-1 text-sm font-medium flex-shrink-0"
            >
              ‹ List
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-zinc-100">{selected.display_title}</p>
              <p className="text-xs text-zinc-500 truncate">{selected.forscore_path}</p>
            </div>
            {selected.detected_key && <span className="chip-key">{selected.detected_key}</span>}
            {selected.version_label && <span className="chip-inst">{selected.version_label}</span>}

            {/* Add to Setlist button + popover */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => { setSetlistPicker(v => !v); setNewSetlistMode(false); setNewSetlistName(''); }}
                title="Add this score to one of your setlists, or create a new setlist"
                className={`text-xs px-2.5 py-1.5 rounded-lg ${setlistPicker ? 'bg-amber-400 text-zinc-950 font-semibold' : 'btn-secondary'}`}
              >
                + Setlist
              </button>

              {setlistPicker && (
                <>
                  {/* Invisible click-outside overlay */}
                  <div className="fixed inset-0 z-30" onClick={closePicker} />
                  {/* Popover */}
                  <div className="absolute right-0 top-full mt-1.5 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/50 z-40 overflow-hidden">
                    <div className="px-3 py-2 border-b border-zinc-800">
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Add to setlist</p>
                    </div>

                    {/* Existing setlists */}
                    <div className="max-h-48 overflow-y-auto">
                      {allSetlists.length === 0 ? (
                        <p className="text-xs text-zinc-500 px-3 py-3 text-center">No setlists yet</p>
                      ) : (
                        allSetlists.map(sl => (
                          <button
                            key={sl.id}
                            onClick={() => handleAddToSetlist(sl.id, sl.name)}
                            className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 bg-transparent border-0 border-b border-zinc-800/50 flex items-center gap-2 rounded-none"
                          >
                            <span className="flex-1 truncate">{sl.name}</span>
                            <span className="text-amber-300 text-xs flex-shrink-0">+ Add</span>
                          </button>
                        ))
                      )}
                    </div>

                    {/* New setlist section */}
                    <div className="border-t border-zinc-800 px-3 py-2.5">
                      {!newSetlistMode ? (
                        <button
                          onClick={() => setNewSetlistMode(true)}
                          className="w-full text-left text-xs text-zinc-400 hover:text-amber-300 bg-transparent border-0 p-0 flex items-center gap-1"
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
                            className="btn-primary text-xs px-2.5 py-1 disabled:opacity-40"
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
              className={`text-xs px-2.5 py-1.5 rounded-lg flex-shrink-0 ${editMode ? 'bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/30' : 'btn-secondary'}`}
            >
              {editMode ? 'Editing ✎' : 'Edit'}
            </button>
            <button
              onClick={() => { setSelected(null); setEditMode(false); closePicker(); }}
              title="Close the viewer and go back to browsing"
              className="btn-ghost text-lg leading-none flex-shrink-0 px-2 py-1"
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
              <div className="text-center text-zinc-500">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 mx-auto mb-4 text-zinc-700">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
                <p className="text-sm font-medium text-zinc-400">Select a score</p>
                <p className="text-xs mt-1 text-zinc-600">Tap any song in the list to view its chart</p>
              </div>
            }
          />
        </div>

        {/* Metadata edit form — shown when edit mode is active */}
        {selected && editMode && (
          <div className="flex-shrink-0 border-t border-zinc-800 bg-zinc-900 p-3">
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-zinc-400 mb-1">Display Title</label>
                <input
                  type="text"
                  value={editFields.display_title || ''}
                  onChange={e => setEditFields(f => ({ ...f, display_title: e.target.value }))}
                  className="w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Status</label>
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
                <label className="block text-xs font-medium text-zinc-400 mb-1">Key</label>
                <select
                  value={editFields.detected_key || ''}
                  onChange={e => setEditFields(f => ({ ...f, detected_key: e.target.value }))}
                  className="w-full text-sm"
                >
                  {KEYS.map(k => <option key={k} value={k}>{k || '— not set —'}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Instrument</label>
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
            <div className="border-t border-zinc-800 pt-2 mt-1 mb-2.5">
              <label className="block text-xs font-medium text-zinc-500 mb-1">Notes / Comments</label>
              <textarea
                value={editFields.notes || ''}
                onChange={e => setEditFields(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. who this is for, special instructions, reminders…"
                rows={2}
                className="w-full text-sm resize-none"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleSaveAndPdf}
                disabled={pdfSaving || saving}
                title="Save to app AND write title + key into the PDF file — forScore will pick these up automatically"
                className="btn-primary disabled:opacity-50 text-sm px-4 py-1.5"
              >
                {pdfSaving ? 'Updating PDF…' : 'Save + update PDF'}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                title="Save key, title, notes to this app only (forScore will not be affected)"
                className="btn-secondary disabled:opacity-50 text-sm px-4 py-1.5"
              >
                {saving ? 'Saving…' : 'Save to app'}
              </button>
              <button
                onClick={() => setAliasModal(selected)}
                title="Add an alternate name for this score — useful when a setlist uses a different title"
                className="btn-ghost text-sm px-3 py-1.5"
              >
                + Alias
              </button>
              {savedMsg && !pdfSavedMsg && <span className="text-emerald-400 text-sm">Saved ✓</span>}
              {pdfSavedMsg && <span className="text-amber-300 text-sm font-medium">Saved + PDF updated ✓</span>}
            </div>
          </div>
        )}
      </div>

      {/* ── Alias modal ─────────────────────────────────────────────────── */}
      {aliasModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setAliasModal(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6 w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-2 text-zinc-100">Add Alias</h2>
            <p className="text-sm text-zinc-400 mb-3">For: <strong className="text-zinc-200">{aliasModal.display_title}</strong></p>
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
              <button onClick={() => setAliasModal(null)} className="btn-ghost">Cancel</button>
              <button onClick={handleAddAlias} className="btn-primary">Add Alias</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
