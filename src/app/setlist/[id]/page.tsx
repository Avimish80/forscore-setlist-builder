'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import StatusBadge from '@/components/StatusBadge';
import { Score } from '@/lib/types';
import {
  getSetlist, updateSetlistItem, deleteSetlistItem,
  reorderSetlistItems, addSetlistItem, rematchSetlist,
  exportSetlistXml, searchScores, createAlias, renameSetlist,
} from '@/lib/data';

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

  const [searchingFor, setSearchingFor] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Score[]>([]);

  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<Score[]>([]);
  const addRef = useRef<HTMLInputElement>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

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
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Lock body scroll when entering edit mode (iOS-compatible)
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

  // Non-passive touchmove on document — only active in edit mode
  useEffect(() => {
    if (!editMode) return;

    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();

      const touch = e.touches[0];

      // Auto-scroll inner list near edges
      const inner = innerScrollRef.current;
      if (inner) {
        const rect = inner.getBoundingClientRect();
        if (touch.clientY < rect.top + 80) inner.scrollTop -= 10;
        else if (touch.clientY > rect.bottom - 80) inner.scrollTop += 10;
      }

      // Find which row finger is over
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

  // Desktop mouse drag (normal mode only)
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
    setSearchingFor(null);
    load();
  }
  function handleRemoveItem(itemId: number) { deleteSetlistItem(id, itemId); load(); }
  function openSearch(itemId: number) { setSearchingFor(itemId); setSearchQuery(''); setSearchResults([]); }

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) { setSearchResults([]); return; }
    setSearchResults(searchScores(searchQuery, 8));
  }, [searchQuery]);

  useEffect(() => {
    if (!addQuery || addQuery.length < 2) { setAddResults([]); return; }
    setAddResults(searchScores(addQuery, 10));
  }, [addQuery]);

  function handleAddScore(score: Score) {
    addSetlistItem(id, { score_id: score.id });
    setAddQuery(''); setAddResults([]);
    load(); addRef.current?.focus();
  }
  function handleAddByName() {
    if (!addQuery.trim()) return;
    addSetlistItem(id, { requested_title: addQuery.trim() });
    setAddQuery(''); setAddResults([]);
    load(); addRef.current?.focus();
  }

  function handleExport() {
    const result = exportSetlistXml(id);
    if (!result) return;
    const blob = new Blob([result.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.name.replace(/[^a-zA-Z0-9\s-]/g, '')}.4ss`;
    a.click();
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

  // ── Edit Order mode ──────────────────────────────────────────────────
  if (editMode) {
    return (
      <div className="flex flex-col h-screen bg-white">
        {/* Fixed header */}
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

        {/* Scrollable drag list */}
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
              {/* Drag handle */}
              <span className="text-gray-300 text-2xl flex-shrink-0 pr-1">⠿</span>
              {/* Number */}
              <span className="text-gray-400 text-sm w-6 flex-shrink-0">{index + 1}</span>
              {/* Song info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{item.requested_title}</p>
                {item.matched_display_title && (
                  <p className="text-xs text-gray-400 truncate">→ {item.matched_display_title}</p>
                )}
              </div>
              {/* Delete */}
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

  // ── Normal mode ──────────────────────────────────────────────────────
  return (
    <div className="p-4 overflow-y-auto h-screen">
      <div className="flex items-center justify-between mb-4">
        <div>
          {editingName ? (
            <input
              ref={nameInputRef}
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
              className="text-2xl font-bold border-b-2 border-blue-500 outline-none bg-transparent w-full"
              autoFocus
            />
          ) : (
            <button
              onClick={() => { setNameValue(setlist.name); setEditingName(true); }}
              className="flex items-center gap-2 group bg-transparent border-0 p-0 text-left"
            >
              <h1 className="text-2xl font-bold">{setlist.name}</h1>
              <span className="text-gray-400 opacity-0 group-hover:opacity-100 text-base">✎</span>
            </button>
          )}
          <p className="text-sm text-gray-500">{matched}/{items.length} matched</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { rematchSetlist(id); load(); }} className="bg-gray-100 hover:bg-gray-200 text-gray-700">Re-match All</button>
          <button onClick={enterEditMode} className="bg-orange-500 hover:bg-orange-600 text-white">Edit Order</button>
          <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white">Export .4ss</button>
        </div>
      </div>

      <div className="overflow-x-auto mb-6">
        <table>
          <thead>
            <tr>
              <th className="w-8"></th>
              <th className="w-10">#</th>
              <th>Requested Song</th>
              <th>Matched Score</th>
              <th className="w-20">Conf.</th>
              <th className="w-28">Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr
                key={item.id}
                data-row-index={index}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDrop}
                onDragOver={e => e.preventDefault()}
                className="hover:bg-gray-50 cursor-grab active:cursor-grabbing"
              >
                <td className="text-gray-300 text-center px-1 text-lg select-none">⠿</td>
                <td className="text-gray-500 text-sm">{index + 1}</td>
                <td className="font-medium">{item.requested_title}</td>
                <td>
                  {item.matched_display_title ? (
                    <div>
                      <span className="text-sm font-medium">{item.matched_display_title}</span>
                      <div className="text-xs text-gray-400">{item.matched_forscore_path}</div>
                      {item.match_reason && <div className="text-xs text-gray-400 italic">{item.match_reason}</div>}
                    </div>
                  ) : (
                    <span className="text-gray-400 text-sm">No match</span>
                  )}
                </td>
                <td>
                  {item.confidence > 0 && (
                    <span className={`text-sm font-mono ${
                      item.confidence >= 0.85 ? 'text-green-600' :
                      item.confidence >= 0.6 ? 'text-yellow-600' : 'text-red-600'
                    }`}>{Math.round(item.confidence * 100)}%</span>
                  )}
                </td>
                <td><StatusBadge status={item.match_status} /></td>
                <td>
                  <div className="flex gap-1 flex-wrap items-center">
                    {item.matched_score_id && (
                      <a href={`forscore://score?title=${encodeURIComponent(item.matched_display_title || '')}`}
                        className="text-indigo-500 hover:text-indigo-700 bg-transparent px-2 py-1 text-xs">forScore</a>
                    )}
                    <button onClick={() => openSearch(item.id)} className="text-blue-600 hover:text-blue-800 bg-transparent px-2 py-1 text-xs">Search</button>
                    <button onClick={() => handleUpdateItem(item.id, null, 'placeholder')} className="text-purple-600 hover:text-purple-800 bg-transparent px-2 py-1 text-xs">Placeholder</button>
                    {item.matched_score_id && (
                      <button onClick={() => createAlias(item.requested_title, item.matched_score_id!)} className="text-green-600 hover:text-green-800 bg-transparent px-2 py-1 text-xs">Alias</button>
                    )}
                    <button onClick={() => handleRemoveItem(item.id)} className="text-red-400 hover:text-red-600 bg-transparent px-2 py-1 text-xs">✕</button>
                  </div>
                  {searchingFor === item.id && (
                    <div className="mt-2 p-2 bg-white rounded border shadow-md w-72 z-10 relative">
                      <input type="text" placeholder="Search scores..." value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)} className="w-full mb-2" autoFocus />
                      <div className="max-h-48 overflow-y-auto">
                        {searchResults.map(score => (
                          <button key={score.id} onClick={() => handleUpdateItem(item.id, score.id, 'matched')}
                            className="block w-full text-left px-2 py-1.5 text-sm hover:bg-blue-50 rounded bg-transparent border-0">
                            <span className="font-medium">{score.display_title}</span>
                            <span className="text-gray-400 text-xs block">{score.forscore_path}</span>
                          </button>
                        ))}
                        {searchQuery.length >= 2 && searchResults.length === 0 && (
                          <p className="text-gray-400 text-xs px-2">No results</p>
                        )}
                      </div>
                      <button onClick={() => setSearchingFor(null)} className="text-xs text-gray-400 mt-1 bg-transparent">Cancel</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border rounded-lg p-4 bg-gray-50 max-w-2xl">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Add Song to Setlist</h2>
        <div className="relative">
          <input ref={addRef} type="text" placeholder="Search library or type a song name…"
            value={addQuery} onChange={e => setAddQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && addResults.length === 0 && addQuery.trim()) handleAddByName(); }}
            className="w-full" />
          {addResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border rounded shadow-lg mt-1 z-20 max-h-64 overflow-y-auto">
              {addResults.map(score => (
                <button key={score.id} onClick={() => handleAddScore(score)}
                  className="block w-full text-left px-3 py-2.5 bg-transparent border-0 border-b border-gray-100 hover:bg-blue-50">
                  <span className="font-medium text-sm">{score.display_title}</span>
                  {score.version_label && <span className="text-xs text-gray-500 ml-2">{score.version_label}</span>}
                  {score.detected_key && <span className="text-xs text-blue-500 ml-1">{score.detected_key}</span>}
                  <span className="text-xs text-gray-400 block">{score.forscore_path}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-400">
            {addResults.length > 0 ? 'Click a result to add it.' : addQuery.length >= 2 ? 'No library match — add by name?' : 'Search your library or type any name to add.'}
          </p>
          {addQuery.trim() && addResults.length === 0 && (
            <button onClick={handleAddByName} className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded">
              Add "{addQuery.trim()}" as unmatched
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
