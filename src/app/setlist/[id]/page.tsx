'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import StatusBadge from '@/components/StatusBadge';
import InlinePdfViewer from '@/components/InlinePdfViewer';
import { Score } from '@/lib/types';
import {
  getSetlist, updateSetlistItem, deleteSetlistItem,
  reorderSetlistItems, addSetlistItem, addSeparatorItem, rematchSetlist,
  exportSetlistXml, searchScores, createAlias, renameSetlist,
  getScore, updateScore,
} from '@/lib/data';

const KEYS = [
  '', 'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Abm', 'Am', 'A#m', 'Bbm', 'Bm',
];

const INSTRUMENTS = [
  'Generic', 'Lead Sheet', 'Piano', 'Piano/Vocal', 'Guitar', 'Bass',
  'Violin', 'Viola', 'Cello', 'Drums', 'Saxophone', 'Alto Sax', 'Tenor Sax',
  'Trumpet', 'Trombone', 'Flute', 'Clarinet', 'Horns', 'Strings', 'Full Score', 'Other',
];

interface ItemRow {
  id: number;
  position: number;
  requested_title: string;
  matched_score_id: number | null;
  matched_display_title: string | null;
  matched_forscore_path: string | null;
  match_status: string;
  confidence: number;
  match_reason: string | null;
  approved: number;
}

interface SetlistData {
  id: number;
  name: string;
  items: ItemRow[];
}

export default function SetlistReviewPage() {
  const params = useParams();
  const id = parseInt(params.id as string);

  const [setlist, setSetlist] = useState<SetlistData | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  // Selected item whose PDF shows on the right
  const [selectedItem, setSelectedItem] = useState<ItemRow | null>(null);

  // Top search — add-only mode
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<Score[]>([]);
  const addRef = useRef<HTMLInputElement>(null);

  // Per-item inline search (replaces assigningItem)
  const [searchingFor, setSearchingFor] = useState<number | null>(null);
  const [itemQuery, setItemQuery] = useState('');
  const [itemResults, setItemResults] = useState<Score[]>([]);
  const itemSearchRef = useRef<HTMLInputElement>(null);

  // Preview score from search results (right panel, without adding/assigning)
  const [previewScore, setPreviewScore] = useState<Score | null>(null);

  // Separator quick-add
  const [showSepInput, setShowSepInput] = useState(false);
  const [sepTitle, setSepTitle] = useState('');
  const sepInputRef = useRef<HTMLInputElement>(null);

  // Inline status picker (per item)
  const [statusPickerFor, setStatusPickerFor] = useState<number | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Score metadata (right panel)
  const [selectedScore, setSelectedScore] = useState<Score | null>(null);
  const [scoreEdit, setScoreEdit] = useState<{
    display_title: string; detected_key: string; version_label: string; status: string; notes: string;
  }>({ display_title: '', detected_key: '', version_label: '', status: 'new', notes: '' });
  const [showScoreEdit, setShowScoreEdit] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const displayTitleRef = useRef<HTMLInputElement>(null);

  // Alias modal (same as Library)
  const [aliasModal, setAliasModal] = useState<Score | null>(null);
  const [aliasText, setAliasText] = useState('');

  const touchDragIndex = useRef<number | null>(null);
  const isDragging = useRef(false);
  const itemsRef = useRef<ItemRow[]>([]);
  const innerScrollRef = useRef<HTMLDivElement>(null);
  const mouseDragIndex = useRef<number | null>(null);

  const load = useCallback(() => {
    const data = getSetlist(id) as SetlistData | null;
    setSetlist(data);
    const newItems = data?.items || [];
    setItems(newItems);
    itemsRef.current = newItems;
    setLoading(false);

    setSelectedItem(prev => {
      if (prev) {
        const stillExists = newItems.find(i => i.id === prev.id);
        return stillExists ?? (newItems.find(i => i.matched_forscore_path) ?? null);
      }
      return newItems.find(i => i.matched_forscore_path) ?? null;
    });
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Load full score details whenever selected item changes
  useEffect(() => {
    if (!selectedItem?.matched_score_id) { setSelectedScore(null); return; }
    const s = getScore(selectedItem.matched_score_id);
    setSelectedScore(s);
    setScoreEdit({
      display_title: s?.display_title ?? '',
      detected_key: s?.detected_key ?? '',
      version_label: s?.version_label ?? '',
      status: s?.status ?? 'new',
      notes: s?.notes ?? '',
    });
    setShowScoreEdit(false);
    setScoreSaved(false);
  }, [selectedItem?.id, selectedItem?.matched_score_id]);

  // ── Edit-order mode ──────────────────────────────────────────────────────
  function enterEditMode() {
    setEditMode(true);
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
  }

  function exitEditMode() {
    setEditMode(false);
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    isDragging.current = false;
    touchDragIndex.current = null;
    setDraggingIndex(null);
    load();
  }

  // Non-passive touchmove — only active in edit mode
  useEffect(() => {
    if (!editMode) return;

    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();

      const touch = e.touches[0];
      const inner = innerScrollRef.current;
      if (inner) {
        const rect = inner.getBoundingClientRect();
        if (touch.clientY < rect.top + 80) inner.scrollTop -= 10;
        else if (touch.clientY > rect.bottom - 80) inner.scrollTop += 10;
      }

      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const row = el?.closest('[data-row-index]');
      if (!row) return;
      const targetIndex = parseInt(row.getAttribute('data-row-index') ?? '');
      if (isNaN(targetIndex) || targetIndex === touchDragIndex.current) return;

      const updated = [...itemsRef.current];
      const dragged = updated.splice(touchDragIndex.current!, 1)[0];
      updated.splice(targetIndex, 0, dragged);
      touchDragIndex.current = targetIndex;
      itemsRef.current = updated;
      setDraggingIndex(targetIndex);
      setItems(updated);
    };

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => document.removeEventListener('touchmove', onTouchMove);
  }, [editMode]);

  function handleTouchStart(index: number) {
    if (!editMode) return;
    touchDragIndex.current = index;
    isDragging.current = true;
    itemsRef.current = [...items];
    setDraggingIndex(index);
  }

  function handleTouchEnd() {
    if (!isDragging.current) return;
    isDragging.current = false;
    reorderSetlistItems(id, itemsRef.current.map(i => i.id));
    touchDragIndex.current = null;
    setDraggingIndex(null);
  }

  // Desktop mouse drag
  function handleDragStart(index: number) { mouseDragIndex.current = index; }
  function handleDragEnter(index: number) {
    if (mouseDragIndex.current === null || mouseDragIndex.current === index) return;
    const updated = [...items];
    const dragged = updated.splice(mouseDragIndex.current, 1)[0];
    updated.splice(index, 0, dragged);
    mouseDragIndex.current = index;
    setItems(updated);
  }
  function handleDrop() {
    mouseDragIndex.current = null;
    reorderSetlistItems(id, items.map(i => i.id));
    load();
  }

  // Row actions
  function handleUpdateItem(itemId: number, scoreId: number | null, status: string) {
    updateSetlistItem(itemId, { matched_score_id: scoreId, match_status: status });
    setStatusPickerFor(null);
    load();
  }
  function handleRemoveItem(itemId: number) {
    if (selectedItem?.id === itemId) setSelectedItem(null);
    deleteSetlistItem(id, itemId);
    load();
  }

  // ── Top add-only search ──────────────────────────────────────────────────
  useEffect(() => {
    if (!addQuery || addQuery.length < 1) { setAddResults([]); return; }
    setAddResults(searchScores(addQuery, 10));
  }, [addQuery]);

  function handleAddResult(score: Score) {
    addSetlistItem(id, { score_id: score.id });
    load();
    setAddQuery(''); setAddResults([]); setPreviewScore(null);
    addRef.current?.focus();
  }

  function handleAddByName() {
    if (!addQuery.trim()) return;
    addSetlistItem(id, { requested_title: addQuery.trim() });
    load();
    setAddQuery(''); setAddResults([]);
    addRef.current?.focus();
  }

  // ── Per-item inline search ───────────────────────────────────────────────
  useEffect(() => {
    if (!itemQuery || itemQuery.length < 1) { setItemResults([]); return; }
    setItemResults(searchScores(itemQuery, 10));
  }, [itemQuery]);

  function openInlineSearch(item: ItemRow) {
    setSearchingFor(item.id);
    setItemQuery(item.requested_title);
    setItemResults(searchScores(item.requested_title, 10));
    setSelectedItem(item);
    setPreviewScore(null);
    setStatusPickerFor(null);
    // Close the add search if open
    setAddQuery(''); setAddResults([]);
    setTimeout(() => itemSearchRef.current?.focus(), 50);
  }

  function closeInlineSearch() {
    setSearchingFor(null);
    setItemQuery('');
    setItemResults([]);
    setPreviewScore(null);
  }

  function handleAssignScore(itemId: number, score: Score) {
    closeInlineSearch();
    handleUpdateItem(itemId, score.id, 'matched');
  }

  // ── Separator ────────────────────────────────────────────────────────────
  function handleAddSeparator() {
    addSeparatorItem(id, sepTitle.trim() || '—');
    setSepTitle(''); setShowSepInput(false);
    load();
  }

  useEffect(() => {
    if (showSepInput) setTimeout(() => sepInputRef.current?.focus(), 50);
  }, [showSepInput]);

  // ── Score edit ───────────────────────────────────────────────────────────
  function handleScoreSave() {
    if (!selectedScore) return;
    const updated = updateScore(selectedScore.id, scoreEdit);
    if (updated) setSelectedScore(updated);
    setScoreSaved(true);
    setTimeout(() => setScoreSaved(false), 2500);
    load(); // refresh item list to reflect updated display title
  }

  function handleEditTitle() {
    setShowScoreEdit(true);
    setScoreSaved(false);
    setTimeout(() => displayTitleRef.current?.focus(), 50);
  }

  function handleAddAlias() {
    if (!aliasModal || !aliasText.trim()) return;
    createAlias(aliasText, aliasModal.id);
    setAliasModal(null);
    setAliasText('');
  }

  // ── Print ────────────────────────────────────────────────────────────────
  function handlePrint() {
    if (!setlist) return;
    let songNumber = 0;
    const rows = items.map(item => {
      const isSeparator = item.match_status === 'placeholder' || !item.matched_score_id;
      if (!isSeparator) songNumber++;
      if (isSeparator) {
        return `<tr class="separator"><td colspan="2">${item.requested_title}</td></tr>`;
      }
      return `<tr><td class="num">${songNumber}</td><td>${item.requested_title}</td></tr>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${setlist.name}</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; max-width: 700px; margin: 40px auto; color: #111; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  p.sub { color: #666; font-size: 14px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 15px; }
  td { padding: 8px 10px; border-bottom: 1px solid #eee; }
  td.num { width: 36px; color: #999; text-align: right; padding-right: 16px; font-size: 13px; }
  tr.separator td { background: #f3f4f6; font-weight: 600; color: #374151; padding: 6px 10px; border-bottom: 2px solid #d1d5db; letter-spacing: 0.03em; font-size: 13px; text-transform: uppercase; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<h1>${setlist.name}</h1>
<p class="sub">${items.filter(i => i.match_status !== 'placeholder' && i.matched_score_id).length} songs</p>
<table>${rows}</table>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  async function handleSendToForScore() {
    const result = exportSetlistXml(id);
    if (!result) return;
    const filename = `${result.name.replace(/[^a-zA-Z0-9\s-]/g, '')}.4ss`;
    const file = new File([result.xml], filename, { type: 'application/xml' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: result.name }); return; } catch (_) {}
    }
    const url = URL.createObjectURL(new Blob([result.xml], { type: 'application/xml' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function handleSaveName() {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== setlist?.name) {
      renameSetlist(id, trimmed);
      load();
    }
    setEditingName(false);
  }

  if (loading) return <p className="text-gray-500 p-6">Loading...</p>;
  if (!setlist) return <p className="text-red-600 p-6">Setlist not found.</p>;

  const matched = items.filter(i => i.match_status === 'matched').length;

  // ── Edit Order mode ───────────────────────────────────────────────────────
  if (editMode) {
    return (
      <div className="flex flex-col h-screen bg-white">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white flex-shrink-0">
          <div>
            <h1 className="text-lg font-bold">{setlist.name}</h1>
            <p className="text-xs text-orange-600">Hold a row and drag to reorder • Tap ✕ to remove</p>
          </div>
          <button
            onClick={exitEditMode}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-semibold text-sm"
          >
            Done
          </button>
        </div>

        <div ref={innerScrollRef} className="flex-1 overflow-y-auto">
          {items.map((item, index) => (
            <div
              key={item.id}
              data-row-index={index}
              onTouchStart={() => handleTouchStart(index)}
              onTouchEnd={handleTouchEnd}
              className={`flex items-center gap-3 px-4 py-3 border-b select-none ${
                draggingIndex === index
                  ? 'bg-blue-100 shadow-md opacity-80 scale-[1.01]'
                  : 'bg-white active:bg-gray-50'
              }`}
              style={{ transition: 'background 0.1s' }}
            >
              <span className="text-gray-300 text-2xl flex-shrink-0 pr-1">⠿</span>
              <span className="text-gray-400 text-sm w-6 flex-shrink-0">{index + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{item.requested_title}</p>
                {item.matched_display_title && (
                  <p className="text-xs text-gray-400 truncate">→ {item.matched_display_title}</p>
                )}
              </div>
              <button
                onTouchStart={e => e.stopPropagation()}
                onClick={() => handleRemoveItem(item.id)}
                className="text-red-400 hover:text-red-600 text-xl px-2 flex-shrink-0 bg-transparent border-0"
              >✕</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Normal mode: split-pane ───────────────────────────────────────────────
  return (
    <>
    <div className="flex h-full overflow-hidden" onClick={() => setStatusPickerFor(null)}>

      {/* ── Left: setlist items ─────────────────────────────────────────── */}
      <div className="flex flex-col w-[40%] min-w-[300px] border-r overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 px-3 py-2 border-b bg-white">
          {/* Setlist name */}
          <div className="flex items-center justify-between gap-2 mb-0.5">
            {editingName ? (
              <input
                ref={nameInputRef}
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                className="text-base font-bold border-b-2 border-blue-500 outline-none bg-transparent flex-1"
                autoFocus
              />
            ) : (
              <button
                onClick={() => { setNameValue(setlist.name); setEditingName(true); }}
                className="flex items-center gap-1.5 group bg-transparent border-0 p-0 text-left flex-1 min-w-0"
              >
                <h1 className="text-base font-bold truncate">{setlist.name}</h1>
                <span className="text-gray-400 opacity-0 group-hover:opacity-100 text-sm flex-shrink-0">✎</span>
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mb-2">{matched}/{items.length} matched</p>

          {/* Action buttons */}
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => { rematchSetlist(id); load(); }} title="Re-run automatic matching for all songs against your library" className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-2 py-1">Re-match</button>
            <button onClick={enterEditMode} title="Drag and drop to change the song order." className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-2 py-1">Edit Order</button>
            <button onClick={handlePrint} title="Open a print-friendly version of this setlist" className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-2 py-1">Print</button>
            <button onClick={handleSendToForScore} title="Export and share the .4ss setlist file — opens directly in forScore" className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1">Save Set List</button>
            <button
              onClick={() => setShowSepInput(v => !v)}
              title="Add a section separator (e.g. 'First Half', 'Dinner Break') to divide the setlist"
              className={`text-xs px-2 py-1 ${showSepInput ? 'bg-purple-600 text-white' : 'bg-purple-100 hover:bg-purple-200 text-purple-700'}`}
            >+ Separator</button>
          </div>

          {/* Separator name input */}
          {showSepInput && (
            <div className="flex gap-1.5 mt-2">
              <input
                ref={sepInputRef}
                type="text"
                placeholder="Section name (e.g. First Half)…"
                value={sepTitle}
                onChange={e => setSepTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddSeparator();
                  if (e.key === 'Escape') { setShowSepInput(false); setSepTitle(''); }
                }}
                className="flex-1 text-sm"
              />
              <button onClick={handleAddSeparator} className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1">Add</button>
              <button onClick={() => { setShowSepInput(false); setSepTitle(''); }} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs px-2 py-1">✕</button>
            </div>
          )}

          {/* ── Add song search box (add-only) ── */}
          <div className="mt-2">
            <input
              ref={addRef}
              type="text"
              placeholder="Add a song — search library or type a name…"
              value={addQuery}
              onChange={e => setAddQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && addQuery.trim()) handleAddByName();
                if (e.key === 'Escape') { setAddQuery(''); setAddResults([]); setPreviewScore(null); }
              }}
              className="w-full text-sm"
            />
          </div>
        </div>

        {/* ── Add-song search results (amber tinted, clearly "add" zone) ── */}
        {addQuery.length >= 1 && (
          <div className="flex-shrink-0 border-b bg-amber-50 overflow-y-auto" style={{ maxHeight: '40%' }}>
            <div className="px-3 pt-1.5 pb-0.5">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Add to setlist:</span>
            </div>
            {addResults.length === 0 ? (
              <div className="px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs text-gray-400">No library match for &ldquo;{addQuery}&rdquo;</span>
                <button onClick={handleAddByName} className="text-xs bg-gray-100 hover:bg-amber-100 text-gray-700 hover:text-amber-800 px-2 py-1 rounded">
                  Add unmatched
                </button>
              </div>
            ) : (
              <>
                {addResults.map(score => {
                  const isPreviewing = previewScore?.forscore_path === score.forscore_path;
                  return (
                    <div
                      key={score.id}
                      className={`flex items-stretch border-b border-amber-100 ${isPreviewing ? 'bg-blue-50' : 'hover:bg-amber-100'}`}
                    >
                      {/* View area — click to preview PDF */}
                      <button
                        onClick={() => setPreviewScore(score)}
                        className="flex-1 text-left px-3 py-2 bg-transparent border-0"
                        title="Preview this score's PDF in the right panel"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm truncate flex-1">{score.display_title}</span>
                          {score.detected_key && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded flex-shrink-0">{score.detected_key}</span>}
                          {score.version_label && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded flex-shrink-0">{score.version_label}</span>}
                          {isPreviewing && <span className="text-xs text-blue-500 flex-shrink-0">▶</span>}
                        </div>
                        <span className="text-xs text-gray-400 block truncate mt-0.5">{score.forscore_path}</span>
                      </button>
                      {/* Add button */}
                      <button
                        onClick={() => handleAddResult(score)}
                        className="flex-shrink-0 px-3 border-l border-amber-200 bg-transparent hover:bg-green-600 text-green-700 hover:text-white text-xs font-semibold transition-colors"
                      >
                        + Add
                      </button>
                    </div>
                  );
                })}
                <button
                  onClick={handleAddByName}
                  className="block w-full text-left px-3 py-2 bg-amber-50 border-0 hover:bg-amber-100 text-gray-500 hover:text-amber-800"
                >
                  <span className="text-xs">+ Add </span>
                  <span className="text-xs font-semibold">&ldquo;{addQuery}&rdquo;</span>
                  <span className="text-xs text-gray-400"> as unmatched (no PDF)</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Item list ── */}
        <div className="flex-1 overflow-y-auto">
          {items.map((item, index) => {
            const isSelected = selectedItem?.id === item.id;
            const isSeparator = item.match_status === 'placeholder';
            const isStatusPickerOpen = statusPickerFor === item.id;
            const isSearching = searchingFor === item.id;

            return (
              <div
                key={item.id}
                data-row-index={index}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDrop}
                onDragOver={e => e.preventDefault()}
                className={`border-b transition-colors ${
                  isSearching
                    ? 'bg-blue-50 border-l-2 border-l-blue-500'
                    : isSelected
                    ? 'bg-blue-50 border-l-2 border-l-blue-500'
                    : 'border-l-2 border-l-transparent hover:bg-gray-50'
                } ${isSeparator && !isSearching && !isSelected ? 'bg-gray-100' : ''}`}
              >
                {/* Main row */}
                <div
                  className="flex items-center gap-2 px-2 py-2 cursor-pointer"
                  onClick={() => {
                    setStatusPickerFor(null);
                    if (item.matched_forscore_path) {
                      setSelectedItem(item);
                      if (isSearching) setPreviewScore(null);
                    }
                  }}
                >
                  <span className="text-gray-300 text-base flex-shrink-0 cursor-grab">⠿</span>
                  <span className="text-gray-400 text-xs w-5 flex-shrink-0 text-right">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate font-medium ${isSeparator ? 'text-gray-500 italic' : ''}`}>
                      {item.requested_title}
                    </p>
                    {item.matched_display_title && item.matched_display_title !== item.requested_title && (
                      <p className="text-xs text-gray-400 truncate">→ {item.matched_display_title}</p>
                    )}
                  </div>
                  {/* Clickable status badge */}
                  {!isSeparator && (
                    <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setStatusPickerFor(isStatusPickerOpen ? null : item.id)}
                        title="Click to change the match status"
                        className="bg-transparent border-0 p-0"
                      >
                        <StatusBadge status={item.match_status} />
                      </button>
                      {isStatusPickerOpen && (
                        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-40 py-1 min-w-[140px]">
                          {[
                            { status: 'matched', label: '✓ Confirmed', color: 'text-green-700 hover:bg-green-50' },
                            { status: 'needs_review', label: '⚠ Needs Review', color: 'text-yellow-700 hover:bg-yellow-50' },
                            { status: 'missing', label: '✕ No Match', color: 'text-red-600 hover:bg-red-50' },
                          ].map(opt => (
                            <button
                              key={opt.status}
                              onClick={() => handleUpdateItem(item.id, item.matched_score_id, opt.status)}
                              className={`block w-full text-left px-3 py-1.5 text-xs font-medium bg-transparent border-0 ${opt.color} ${item.match_status === opt.status ? 'font-bold' : ''}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action row */}
                <div className="flex items-center gap-0.5 px-2 pb-1.5" onClick={e => e.stopPropagation()}>
                  {item.matched_forscore_path && (
                    <button
                      onClick={() => { setSelectedItem(item); setStatusPickerFor(null); if (isSearching) setPreviewScore(null); }}
                      title="Show this song's chart in the right panel"
                      className={`text-xs px-2 py-0.5 rounded ${isSelected && !previewScore ? 'text-blue-700 bg-blue-100' : 'text-indigo-600 hover:text-indigo-800 bg-transparent'}`}
                    >
                      {isSelected && !previewScore ? '▶ Viewing' : 'View'}
                    </button>
                  )}
                  <button
                    onClick={() => isSearching ? closeInlineSearch() : openInlineSearch(item)}
                    title={isSearching ? 'Close search panel' : 'Search your library to manually pick which score this song maps to'}
                    className={`text-xs px-2 py-0.5 rounded ${isSearching ? 'bg-blue-600 text-white' : 'text-blue-600 hover:text-blue-800 bg-transparent'}`}
                  >
                    {isSearching ? '✕ Close' : 'Search'}
                  </button>
                  <button
                    onClick={() => handleUpdateItem(item.id, null, 'placeholder')}
                    title="Convert to a section separator — appears as a divider in forScore"
                    className="text-purple-600 hover:text-purple-800 bg-transparent text-xs px-2 py-0.5"
                  >
                    Sep.
                  </button>
                  {item.matched_score_id && (
                    <button
                      onClick={() => createAlias(item.requested_title, item.matched_score_id!)}
                      title={`Save "${item.requested_title}" as an alias — future setlists will match it automatically`}
                      className="text-green-600 hover:text-green-800 bg-transparent text-xs px-2 py-0.5"
                    >
                      Alias
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    title="Remove this song from the setlist"
                    className="text-red-400 hover:text-red-600 bg-transparent text-xs px-2 py-0.5 ml-auto"
                  >
                    ✕
                  </button>
                </div>

                {/* ── Inline search panel — appears below this item row ── */}
                {isSearching && (
                  <div className="mx-2 mb-2 rounded-lg border border-blue-300 bg-white shadow-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-3 pt-2 pb-1.5 bg-blue-600">
                      <span className="text-xs font-semibold text-white flex-1">
                        Find a match for: <span className="font-bold">{item.requested_title}</span>
                      </span>
                      <button
                        onClick={closeInlineSearch}
                        className="text-blue-200 hover:text-white bg-transparent border-0 p-0 text-sm leading-none"
                      >✕</button>
                    </div>
                    <div className="px-2 py-2">
                      <input
                        ref={itemSearchRef}
                        type="text"
                        value={itemQuery}
                        onChange={e => setItemQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') closeInlineSearch(); }}
                        placeholder="Search library…"
                        className="w-full text-sm"
                      />
                    </div>
                    <div className="max-h-56 overflow-y-auto border-t border-blue-100">
                      {itemResults.length === 0 && itemQuery.length > 0 && (
                        <p className="text-xs text-gray-400 px-3 py-2.5">No matches found for &ldquo;{itemQuery}&rdquo;</p>
                      )}
                      {itemResults.length === 0 && itemQuery.length === 0 && (
                        <p className="text-xs text-gray-400 px-3 py-2.5">Start typing to search your library…</p>
                      )}
                      {itemResults.map(score => {
                        const isPreviewing = previewScore?.forscore_path === score.forscore_path;
                        return (
                          <div
                            key={score.id}
                            className={`flex items-stretch border-b border-gray-100 last:border-b-0 ${isPreviewing ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                          >
                            {/* Click row to preview PDF */}
                            <button
                              onClick={() => setPreviewScore(score)}
                              className="flex-1 text-left px-3 py-2 bg-transparent border-0"
                              title="Preview this score's PDF in the right panel"
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-sm truncate flex-1">{score.display_title}</span>
                                {score.detected_key && <span className="text-xs bg-amber-100 text-amber-700 px-1 py-0.5 rounded flex-shrink-0">{score.detected_key}</span>}
                                {score.version_label && <span className="text-xs bg-blue-100 text-blue-700 px-1 py-0.5 rounded flex-shrink-0">{score.version_label}</span>}
                                {isPreviewing && <span className="text-xs text-blue-500 ml-1 flex-shrink-0">▶</span>}
                              </div>
                            </button>
                            {/* Assign button */}
                            <button
                              onClick={() => handleAssignScore(item.id, score)}
                              className="flex-shrink-0 px-3 border-l border-gray-200 bg-transparent hover:bg-green-600 text-green-700 hover:text-white text-xs font-semibold transition-colors whitespace-nowrap"
                              title="Assign this score to the song"
                            >
                              Assign ✓
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: PDF viewer ────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Preview banner — shown when browsing search results */}
        {previewScore && (
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs">
            <span className="font-semibold truncate flex-1">Previewing: {previewScore.display_title}</span>
            {searchingFor
              ? <span className="text-blue-200">Click &ldquo;Assign ✓&rdquo; to use this score</span>
              : <span className="text-blue-200">Click &ldquo;+ Add&rdquo; to add to setlist</span>
            }
          </div>
        )}

        {/* Header strip: song title + key/instrument badges + Edit toggle */}
        {selectedItem && !previewScore && (
          <div className="flex-shrink-0 border-b bg-gray-50">
            {/* Top row */}
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                {/* Song name with ✎ shortcut to edit display title */}
                <div className="flex items-center gap-1 group/title">
                  <p className="font-semibold text-sm truncate">{selectedItem.requested_title}</p>
                  {selectedScore && (
                    <button
                      onClick={handleEditTitle}
                      title="Edit this score's display title"
                      className="text-gray-300 hover:text-blue-500 opacity-0 group-hover/title:opacity-100 text-xs bg-transparent border-0 p-0 flex-shrink-0"
                    >✎</button>
                  )}
                </div>
                {/* File title (if different) with its own ✎ */}
                {selectedItem.matched_display_title && selectedItem.matched_display_title !== selectedItem.requested_title && (
                  <div className="flex items-center gap-1 group/filetitle">
                    <p className="text-xs text-gray-400 truncate">→ {selectedItem.matched_display_title}</p>
                    {selectedScore && (
                      <button
                        onClick={handleEditTitle}
                        title="Edit the file's display title"
                        className="text-gray-300 hover:text-blue-500 opacity-0 group-hover/filetitle:opacity-100 text-xs bg-transparent border-0 p-0 flex-shrink-0"
                      >✎</button>
                    )}
                  </div>
                )}
              </div>
              {selectedScore?.detected_key && (
                <span className="flex-shrink-0 bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded font-semibold">{selectedScore.detected_key}</span>
              )}
              {selectedScore?.version_label && (
                <span className="flex-shrink-0 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">{selectedScore.version_label}</span>
              )}
              <button
                onClick={() => { setShowScoreEdit(v => !v); setScoreSaved(false); }}
                title="Edit this score's key, instrument, and status"
                className={`flex-shrink-0 text-xs px-2.5 py-1 rounded ${showScoreEdit ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
              >
                Edit
              </button>
            </div>

            {/* Edit form — identical layout to Library page */}
            {showScoreEdit && selectedScore && (
              <div className="border-t bg-gray-50 p-3">
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Display Title</label>
                    <input
                      ref={displayTitleRef}
                      type="text"
                      value={scoreEdit.display_title}
                      onChange={e => setScoreEdit(f => ({ ...f, display_title: e.target.value }))}
                      className="w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Status</label>
                    <select value={scoreEdit.status} onChange={e => setScoreEdit(f => ({ ...f, status: e.target.value }))} className="w-full text-sm">
                      <option value="new">New</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="unknown">Unknown</option>
                      <option value="duplicate">Duplicate</option>
                      <option value="ignored">Ignored</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Key</label>
                    <select value={scoreEdit.detected_key} onChange={e => setScoreEdit(f => ({ ...f, detected_key: e.target.value }))} className="w-full text-sm">
                      {KEYS.map(k => <option key={k} value={k}>{k || '— not set —'}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-0.5">Instrument</label>
                    <select value={scoreEdit.version_label} onChange={e => setScoreEdit(f => ({ ...f, version_label: e.target.value }))} className="w-full text-sm">
                      {INSTRUMENTS.map(i => <option key={i} value={i === 'Generic' ? '' : i}>{i}</option>)}
                    </select>
                  </div>
                </div>

                {/* Notes — full-width, separate from the metadata grid */}
                <div className="border-t border-gray-200 pt-2 mt-1 mb-2">
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">Notes / Comments</label>
                  <textarea
                    value={scoreEdit.notes}
                    onChange={e => setScoreEdit(f => ({ ...f, notes: e.target.value }))}
                    placeholder="e.g. who this is for, special instructions, reminders…"
                    rows={2}
                    className="w-full text-sm resize-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={handleScoreSave} title="Save changes to this score's metadata" className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5">Save</button>
                  <button onClick={() => setAliasModal(selectedScore)} title="Add an alternate name for this score — useful when a setlist uses a different title" className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm px-3 py-1.5">+ Alias</button>
                  {scoreSaved && <span className="text-green-600 text-sm">Saved ✓</span>}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <InlinePdfViewer
            filename={previewScore?.forscore_path ?? selectedItem?.matched_forscore_path ?? null}
            placeholder={
              <div className="text-center text-gray-500">
                <p className="text-5xl mb-4">🎼</p>
                <p className="text-sm font-medium">Tap a matched song</p>
                <p className="text-xs mt-1 text-gray-600">The chart will appear here</p>
              </div>
            }
          />
        </div>
      </div>
    </div>

    {/* ── Alias modal — identical to Library page ──────────────────────── */}
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
    </>
  );
}
