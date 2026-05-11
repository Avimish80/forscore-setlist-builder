'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import StatusBadge from '@/components/StatusBadge';
import { Score } from '@/lib/types';
import {
  getSetlist, updateSetlistItem, deleteSetlistItem,
  reorderSetlistItems, addSetlistItem, rematchSetlist,
  exportSetlistXml, searchScores, createAlias,
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

  const [searchingFor, setSearchingFor] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Score[]>([]);

  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<Score[]>([]);
  const addRef = useRef<HTMLInputElement>(null);

  // Touch drag state
  const touchDragIndex = useRef<number | null>(null);
  const isDragging = useRef(false);
  const itemsRef = useRef<ItemRow[]>([]);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const load = useCallback(() => {
    const data = getSetlist(id) as SetlistData | null;
    setSetlist(data);
    const newItems = data?.items || [];
    setItems(newItems);
    itemsRef.current = newItems;
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Attach non-passive touchmove to tbody so preventDefault() actually works
  useEffect(() => {
    const el = tbodyRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();

      const touch = e.touches[0];

      // Auto-scroll when near edges of scroll container
      const container = scrollContainerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const edgeSize = 80;
        if (touch.clientY < rect.top + edgeSize) {
          container.scrollTop -= 8;
        } else if (touch.clientY > rect.bottom - edgeSize) {
          container.scrollTop += 8;
        }
      }

      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const row = target?.closest('[data-row-index]');
      if (!row) return;
      const targetIndex = parseInt(row.getAttribute('data-row-index') || '');
      if (isNaN(targetIndex) || targetIndex === touchDragIndex.current) return;

      const updated = [...itemsRef.current];
      const dragged = updated.splice(touchDragIndex.current!, 1)[0];
      updated.splice(targetIndex, 0, dragged);
      touchDragIndex.current = targetIndex;
      itemsRef.current = updated;
      setDraggingIndex(targetIndex);
      setItems(updated);
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, []);

  // ── Touch drag-and-drop (iPad) ──
  function handleTouchStart(_e: React.TouchEvent, index: number) {
    touchDragIndex.current = index;
    isDragging.current = true;
    setDraggingIndex(index);
  }

  function handleTouchEnd() {
    isDragging.current = false;
    reorderSetlistItems(id, itemsRef.current.map(i => i.id));
    touchDragIndex.current = null;
    setDraggingIndex(null);
    load();
  }

  // ── Mouse drag-and-drop (desktop) ──
  const mouseDragIndex = useRef<number | null>(null);

  function handleDragStart(index: number) {
    mouseDragIndex.current = index;
  }

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

  // ── Row actions ──
  function handleUpdateItem(itemId: number, scoreId: number | null, status: string) {
    updateSetlistItem(itemId, { matched_score_id: scoreId, match_status: status });
    setSearchingFor(null);
    load();
  }

  function handleRemoveItem(itemId: number) {
    deleteSetlistItem(id, itemId);
    load();
  }

  function handleSaveAlias(aliasText: string, scoreId: number) {
    createAlias(aliasText, scoreId);
  }

  function openSearch(itemId: number) {
    setSearchingFor(itemId);
    setSearchQuery('');
    setSearchResults([]);
  }

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) { setSearchResults([]); return; }
    setSearchResults(searchScores(searchQuery, 8));
  }, [searchQuery]);

  // ── Add-song panel ──
  useEffect(() => {
    if (!addQuery || addQuery.length < 2) { setAddResults([]); return; }
    setAddResults(searchScores(addQuery, 10));
  }, [addQuery]);

  function handleAddScore(score: Score) {
    addSetlistItem(id, { score_id: score.id });
    setAddQuery('');
    setAddResults([]);
    load();
    addRef.current?.focus();
  }

  function handleAddByName() {
    if (!addQuery.trim()) return;
    addSetlistItem(id, { requested_title: addQuery.trim() });
    setAddQuery('');
    setAddResults([]);
    load();
    addRef.current?.focus();
  }

  // ── Export ──
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

  function handleRematch() {
    rematchSetlist(id);
    load();
  }

  function handlePreview() {
    const result = exportSetlistXml(id);
    if (result) alert(result.xml);
  }

  if (loading) return <p className="text-gray-500 p-6">Loading...</p>;
  if (!setlist) return <p className="text-red-600 p-6">Setlist not found.</p>;

  const matched = items.filter(i => i.match_status === 'matched').length;

  return (
    <div ref={scrollContainerRef} className="p-4 overflow-y-auto h-screen">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">{setlist.name}</h1>
          <p className="text-sm text-gray-500">{matched}/{items.length} matched</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleRematch} className="bg-gray-100 hover:bg-gray-200 text-gray-700">Re-match All</button>
          <button onClick={handlePreview} className="bg-gray-100 hover:bg-gray-200 text-gray-700">Preview XML</button>
          <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white">Export .4ss</button>
        </div>
      </div>

      {/* Setlist table */}
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
          <tbody ref={tbodyRef}>
            {items.map((item, index) => (
              <tr
                key={item.id}
                data-row-index={index}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDrop}
                onDragOver={e => e.preventDefault()}
                onTouchStart={e => handleTouchStart(e, index)}
                onTouchEnd={handleTouchEnd}
                className={`hover:bg-gray-50 cursor-grab active:cursor-grabbing select-none transition-opacity ${
                  draggingIndex === index ? 'opacity-50 bg-blue-50' : ''
                }`}
              >
                <td className="text-gray-300 text-center px-1 text-lg">⠿</td>
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
                    }`}>
                      {Math.round(item.confidence * 100)}%
                    </span>
                  )}
                </td>

                <td><StatusBadge status={item.match_status} /></td>

                <td>
                  <div className="flex gap-1 flex-wrap items-center">
                    {item.matched_score_id && (
                      <a
                        href={`forscore://score?title=${encodeURIComponent(item.matched_display_title || '')}`}
                        className="text-indigo-500 hover:text-indigo-700 bg-transparent px-2 py-1 text-xs"
                      >
                        forScore
                      </a>
                    )}
                    <button onClick={() => openSearch(item.id)} className="text-blue-600 hover:text-blue-800 bg-transparent px-2 py-1 text-xs">Search</button>
                    <button onClick={() => handleUpdateItem(item.id, null, 'placeholder')} className="text-purple-600 hover:text-purple-800 bg-transparent px-2 py-1 text-xs">Placeholder</button>
                    {item.matched_score_id && (
                      <button onClick={() => handleSaveAlias(item.requested_title, item.matched_score_id!)} className="text-green-600 hover:text-green-800 bg-transparent px-2 py-1 text-xs">Alias</button>
                    )}
                    <button onClick={() => handleRemoveItem(item.id)} className="text-red-400 hover:text-red-600 bg-transparent px-2 py-1 text-xs">✕</button>
                  </div>

                  {searchingFor === item.id && (
                    <div className="mt-2 p-2 bg-white rounded border shadow-md w-72 z-10 relative">
                      <input
                        type="text" placeholder="Search scores..." value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full mb-2" autoFocus
                      />
                      <div className="max-h-48 overflow-y-auto">
                        {searchResults.map(score => (
                          <button
                            key={score.id}
                            onClick={() => handleUpdateItem(item.id, score.id, 'matched')}
                            className="block w-full text-left px-2 py-1.5 text-sm hover:bg-blue-50 rounded bg-transparent border-0"
                          >
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

      {/* Add song panel */}
      <div className="border rounded-lg p-4 bg-gray-50 max-w-2xl">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Add Song to Setlist</h2>
        <div className="relative">
          <input
            ref={addRef} type="text"
            placeholder="Search library or type a song name…"
            value={addQuery} onChange={e => setAddQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && addResults.length === 0 && addQuery.trim()) handleAddByName(); }}
            className="w-full"
          />
          {addResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border rounded shadow-lg mt-1 z-20 max-h-64 overflow-y-auto">
              {addResults.map(score => (
                <button
                  key={score.id}
                  onClick={() => handleAddScore(score)}
                  className="block w-full text-left px-3 py-2.5 bg-transparent border-0 border-b border-gray-100 hover:bg-blue-50"
                >
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
            <button
              onClick={handleAddByName}
              className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded"
            >
              Add "{addQuery.trim()}" as unmatched
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
