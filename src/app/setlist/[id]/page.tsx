'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import StatusBadge from '@/components/StatusBadge';
import InlinePdfViewer from '@/components/InlinePdfViewer';
import PdfStatusBanner from '@/components/PdfStatusBanner';
import { Score } from '@/lib/types';
import {
  getSetlist, updateSetlistItem, deleteSetlistItem,
  reorderSetlistItems, addSetlistItem, addSeparatorItem, rematchSetlist,
  exportSetlistXml, searchScores, createAlias, renameSetlist,
  getScore, updateScore,
  getSetlistInstruments, setSetlistInstruments, getInstrumentUsage, InstrumentUsage,
  setPartOverride, clearPartOverride, exportInstrumentSetlistXml,
} from '@/lib/data';
import { getInstrumentView, getVariationsForItem, resolvePartForItem, ResolvedPart, PartSource } from '@/lib/parts';
import { INSTRUMENTS as ALL_INSTRUMENTS } from '@/lib/instruments';
import { writeMetadataToPdf } from '@/lib/pdf-metadata';

const KEYS = [
  '', 'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Abm', 'Am', 'A#m', 'Bbm', 'Bm',
];

// 'Generic' is the UI name for an empty instrument label — a score any player reads.
const INSTRUMENTS = ['Generic', ...ALL_INSTRUMENTS];

// Small status dot on each quick-switch pill, matching the badge colors used
// in the instrument view list so the two stay visually consistent.
const DOT_COLOR: Record<PartSource, string> = {
  manual: 'bg-sky-400', exact: 'bg-emerald-400', family: 'bg-violet-400',
  generic: 'bg-zinc-500', fallback: 'bg-amber-400', missing: 'bg-red-400',
};

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

  // Phone: one pane at a time. The page auto-selects the first matched song,
  // so selection alone must NOT hide the list — only explicit view actions do.
  const [mobilePane, setMobilePane] = useState<'list' | 'pdf'>('list');

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
  const [pdfSaving, setPdfSaving] = useState(false);
  const [pdfSaved, setPdfSaved] = useState(false);
  const displayTitleRef = useRef<HTMLInputElement>(null);

  // Alias modal (same as Library)
  const [aliasModal, setAliasModal] = useState<Score | null>(null);
  const [aliasText, setAliasText] = useState('');
  const [aliasSavedFor, setAliasSavedFor] = useState<number | null>(null);

  // ── Instrument views ──
  // activeView is null for the main setlist, or an instrument name for a view.
  const [instruments, setInstruments] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<string | null>(null);
  const [viewParts, setViewParts] = useState<ResolvedPart[]>([]);
  const [showInstrumentPicker, setShowInstrumentPicker] = useState(false);
  const [instrumentUsage, setInstrumentUsage] = useState<InstrumentUsage[]>([]);
  const [overrideFor, setOverrideFor] = useState<number | null>(null);
  const [overrideChoices, setOverrideChoices] = useState<Score[]>([]);
  const [savingAll, setSavingAll] = useState(false);
  const [savedAllMsg, setSavedAllMsg] = useState<string | null>(null);

  // ── Quick chart switcher ──
  // Which instrument's chart is shown for the selected song, independent of
  // which tab is active — lets you peek at another player's part without
  // leaving Main. null means "the song's own matched score" (Main).
  const [chartInstrument, setChartInstrument] = useState<string | null>(null);
  // Every configured instrument's resolution for the selected song, so the
  // pill row can show a status dot per instrument without extra clicks.
  const [chartOptions, setChartOptions] = useState<Record<string, ResolvedPart>>({});

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

  // Instrument views derive from the main setlist, so recompute whenever the
  // setlist changes — that is what keeps every view in step automatically.
  const refreshView = useCallback(() => {
    if (!activeView) { setViewParts([]); return; }
    setViewParts(getInstrumentView(id, activeView));
  }, [id, activeView]);

  useEffect(() => { setInstruments(getSetlistInstruments(id)); }, [id]);
  useEffect(() => { refreshView(); }, [refreshView, items]);

  // What instruments actually have labelled charts right now — read fresh
  // each time the picker opens so a recent edit or backfill shows up.
  useEffect(() => { if (showInstrumentPicker) setInstrumentUsage(getInstrumentUsage()); }, [showInstrumentPicker]);

  // The pill row defaults to whichever tab you're on: picking a new song, or
  // switching tabs, resets the quick-switch choice back to that default.
  useEffect(() => { setChartInstrument(activeView); }, [selectedItem?.id, activeView]);

  // If the instrument currently shown was removed from the setlist's chosen
  // list, fall back rather than keep displaying a chart for a dropped instrument.
  useEffect(() => {
    if (chartInstrument && !instruments.includes(chartInstrument)) setChartInstrument(activeView);
  }, [instruments, activeView, chartInstrument]);

  // Every instrument's resolution for the selected song — powers the pill
  // row's status dots. Recomputes whenever the setlist or overrides change.
  useEffect(() => {
    if (!selectedItem || instruments.length === 0) { setChartOptions({}); return; }
    const opts: Record<string, ResolvedPart> = {};
    for (const name of instruments) opts[name] = resolvePartForItem(selectedItem.id, name);
    setChartOptions(opts);
  }, [selectedItem?.id, instruments, items]);

  function toggleInstrument(name: string) {
    const next = instruments.includes(name)
      ? instruments.filter(i => i !== name)
      : [...instruments, name];
    setInstruments(next);
    setSetlistInstruments(id, next);
    if (activeView === name && !next.includes(name)) setActiveView(null);
  }

  function openOverridePicker(itemId: number) {
    setOverrideChoices(getVariationsForItem(itemId));
    setOverrideFor(overrideFor === itemId ? null : itemId);
  }

  function chooseOverride(itemId: number, scoreId: number) {
    if (!activeView) return;
    setPartOverride(itemId, activeView, scoreId);
    setOverrideFor(null);
    refreshView();
  }

  function resetOverride(itemId: number) {
    if (!activeView) return;
    clearPartOverride(itemId, activeView);
    setOverrideFor(null);
    refreshView();
  }

  async function handleExportView() {
    const result = activeView
      ? exportInstrumentSetlistXml(id, activeView)
      : exportSetlistXml(id);
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

  /**
   * Export the main setlist plus every instrument view in one action — the
   * one-by-one "Save {View}" button still exists per tab for a single file.
   */
  async function handleSaveAll() {
    if (savingAll) return;
    setSavingAll(true);
    setSavedAllMsg(null);

    const results = [exportSetlistXml(id), ...instruments.map(name => exportInstrumentSetlistXml(id, name))]
      .filter((r): r is { xml: string; name: string } => !!r);

    if (results.length === 0) { setSavingAll(false); return; }

    const files = results.map(r => new File(
      [r.xml],
      `${r.name.replace(/[^a-zA-Z0-9\s-]/g, '')}.4ss`,
      { type: 'application/xml' },
    ));

    if (navigator.canShare && navigator.canShare({ files })) {
      try {
        await navigator.share({ files, title: setlist?.name });
        setSavingAll(false);
        return;
      } catch (_) {
        // User cancelled the share sheet, or the OS declined multi-file share —
        // fall through to individual downloads rather than leaving nothing saved.
      }
    }

    for (let i = 0; i < files.length; i++) {
      const url = URL.createObjectURL(files[i]);
      const a = document.createElement('a');
      a.href = url; a.download = files[i].name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      // iOS Safari can drop a second download triggered in the same tick.
      if (i < files.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    setSavingAll(false);
    setSavedAllMsg(`Saved ${files.length} files ✓`);
    setTimeout(() => setSavedAllMsg(null), 4000);
  }

  // Load the score currently shown in the PDF panel — the song's own match on
  // Main, or whichever instrument's resolved part the quick switcher picked.
  // Edit / Save then naturally act on whatever is actually on screen.
  useEffect(() => {
    if (!selectedItem) { setSelectedScore(null); return; }

    const scoreId = chartInstrument
      ? resolvePartForItem(selectedItem.id, chartInstrument).score_id
      : selectedItem.matched_score_id;

    if (!scoreId) {
      setSelectedScore(null);
      setShowScoreEdit(false);
      setScoreSaved(false);
      return;
    }

    const s = getScore(scoreId);
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
  }, [selectedItem?.id, selectedItem?.matched_score_id, chartInstrument, items]);

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
    load();
  }

  async function handleScoreSaveAndPdf() {
    if (!selectedScore) return;
    handleScoreSave();
    setPdfSaving(true);
    const ok = await writeMetadataToPdf({
      forscore_path: selectedScore.forscore_path,
      display_title: scoreEdit.display_title,
      detected_key: scoreEdit.detected_key,
      version_label: scoreEdit.version_label,
    });
    setPdfSaving(false);
    if (ok) {
      setPdfSaved(true);
      setTimeout(() => setPdfSaved(false), 3000);
    }
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

  // Quick one-click alias from a setlist row: saves the typed title as an
  // alias for its matched score, and immediately confirms the row instead of
  // waiting for a separate Re-match click.
  function handleAddAliasFromItem(item: ItemRow) {
    if (!item.matched_score_id) return;
    createAlias(item.requested_title, item.matched_score_id);
    updateSetlistItem(item.id, { match_status: 'matched' });
    load();
    setAliasSavedFor(item.id);
    setTimeout(() => setAliasSavedFor(current => (current === item.id ? null : current)), 2000);
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

  if (loading) return <p className="text-zinc-500 p-6">Loading...</p>;
  if (!setlist) return <p className="text-red-400 p-6">Setlist not found.</p>;

  const matched = items.filter(i => i.match_status === 'matched').length;

  // ── Edit Order mode ───────────────────────────────────────────────────────
  if (editMode) {
    return (
      <div className="flex flex-col h-dvh bg-zinc-950">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950 flex-shrink-0">
          <div>
            <h1 className="text-lg font-bold tracking-tight">{setlist.name}</h1>
            <p className="text-xs text-amber-300/80">Hold a row and drag to reorder • Tap ✕ to remove</p>
          </div>
          <button
            onClick={exitEditMode}
            className="btn-primary px-5 py-2 rounded-lg text-sm"
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
              className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800/70 select-none ${
                draggingIndex === index
                  ? 'bg-amber-400/10 ring-1 ring-inset ring-amber-400/40 opacity-90 scale-[1.01]'
                  : 'bg-zinc-950 active:bg-zinc-900'
              }`}
              style={{ transition: 'background 0.1s' }}
            >
              <span className="text-zinc-600 text-2xl flex-shrink-0 pr-1">⠿</span>
              <span className="text-zinc-500 text-sm w-6 flex-shrink-0 tabular-nums">{index + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate text-zinc-100">{item.requested_title}</p>
                {item.matched_display_title && (
                  <p className="text-xs text-zinc-500 truncate">→ {item.matched_display_title}</p>
                )}
              </div>
              <button
                onTouchStart={e => e.stopPropagation()}
                onClick={() => handleRemoveItem(item.id)}
                className="text-red-400/60 hover:text-red-400 text-xl px-2 flex-shrink-0 bg-transparent border-0"
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
    <div className="flex flex-col h-full overflow-hidden" onClick={() => setStatusPickerFor(null)}>
    <PdfStatusBanner />
    <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* ── Left: setlist items — full width on phones, hidden while viewing a chart ── */}
      <div className={`flex-col w-full md:w-[40%] md:min-w-[300px] border-r border-zinc-800 overflow-hidden ${mobilePane === 'pdf' ? 'hidden md:flex' : 'flex'}`}>

        {/* Header */}
        <div className="flex-shrink-0 px-3 py-2.5 border-b border-zinc-800 bg-zinc-950">
          {/* Setlist name */}
          <div className="flex items-center justify-between gap-2 mb-0.5">
            {editingName ? (
              <input
                ref={nameInputRef}
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                className="text-base font-bold border-0 border-b-2 border-amber-400 rounded-none outline-none bg-transparent flex-1 px-0 py-0 focus:ring-0"
                autoFocus
              />
            ) : (
              <button
                onClick={() => { setNameValue(setlist.name); setEditingName(true); }}
                className="flex items-center gap-1.5 group bg-transparent border-0 p-0 text-left flex-1 min-w-0 rounded-none"
              >
                <h1 className="text-base font-bold tracking-tight truncate text-zinc-100">{setlist.name}</h1>
                <span className="text-zinc-500 opacity-0 group-hover:opacity-100 text-sm flex-shrink-0">✎</span>
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-500 mb-2.5 tabular-nums">{matched}/{items.length} matched</p>

          {/* Instrument view tabs — Main plus one per chosen instrument */}
          <div className="flex items-center gap-1 flex-wrap mb-2">
            <button
              onClick={() => { setActiveView(null); setOverrideFor(null); }}
              title="The main setlist — add, remove, and reorder songs here"
              className={`text-xs px-2.5 py-1 rounded-md ${activeView === null ? 'bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/30' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 bg-transparent'}`}
            >
              Main
            </button>
            {instruments.map(name => (
              <button
                key={name}
                onClick={() => { setActiveView(name); setOverrideFor(null); }}
                title={`${name} view — each song resolved to the ${name} score`}
                className={`text-xs px-2.5 py-1 rounded-md ${activeView === name ? 'bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/30' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 bg-transparent'}`}
              >
                {name}
              </button>
            ))}
            <div className="relative">
              <button
                onClick={() => setShowInstrumentPicker(v => !v)}
                title="Choose which instrument views this setlist should have"
                className="text-xs px-2 py-1 rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 bg-transparent"
              >
                ＋ Instruments
              </button>
              {showInstrumentPicker && (() => {
                const usedNames = new Set(instrumentUsage.map(u => u.name));
                const unusedInstruments = ALL_INSTRUMENTS.filter(name => !usedNames.has(name));
                return (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowInstrumentPicker(false)} />
                    <div className="absolute left-0 top-full mt-1.5 w-60 max-h-80 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/50 z-40 py-1">
                      {instrumentUsage.length > 0 && (
                        <>
                          <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">In your library</p>
                          {instrumentUsage.map(({ name, count }) => (
                            <button
                              key={name}
                              onClick={() => toggleInstrument(name)}
                              title={`${count} chart${count === 1 ? '' : 's'} labelled ${name}`}
                              className="w-full text-left px-3 py-1.5 text-xs bg-transparent border-0 rounded-none flex items-center gap-2 text-zinc-200 hover:bg-zinc-800"
                            >
                              <span className={`w-3.5 flex-shrink-0 ${instruments.includes(name) ? 'text-amber-300' : 'text-transparent'}`}>✓</span>
                              <span className="flex-1 truncate">{name}</span>
                              <span className="text-zinc-500 text-[11px] tabular-nums flex-shrink-0">{count}</span>
                            </button>
                          ))}
                        </>
                      )}
                      {unusedInstruments.length > 0 && (
                        <>
                          <p className={`px-3 pb-1 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider ${instrumentUsage.length > 0 ? 'pt-2 mt-1 border-t border-zinc-800' : 'pt-1.5'}`}>
                            No charts yet
                          </p>
                          {unusedInstruments.map(name => (
                            <button
                              key={name}
                              onClick={() => toggleInstrument(name)}
                              title={`No charts are labelled ${name} yet — add the view now and it fills in once one is`}
                              className="w-full text-left px-3 py-1.5 text-xs bg-transparent border-0 rounded-none flex items-center gap-2 text-zinc-400 hover:bg-zinc-800"
                            >
                              <span className={`w-3.5 flex-shrink-0 ${instruments.includes(name) ? 'text-amber-300' : 'text-transparent'}`}>✓</span>
                              <span className="flex-1 truncate">{name}</span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-1.5 flex-wrap items-center">
            <Link
              href={`/setlist/${id}/play`}
              title="Full-screen charts for the gig, with optional live sync to the band's devices"
              className="text-xs px-3 py-1.5 rounded-md bg-emerald-400/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/30 hover:bg-emerald-400/25 font-semibold"
            >
              ▶ Live
            </Link>
            <button onClick={handleExportView} title={activeView ? `Export just the ${activeView} view as its own .4ss file for forScore` : 'Export and share the .4ss setlist file — opens directly in forScore'} className="btn-primary text-xs px-3 py-1.5 rounded-md">
              {activeView ? `Save ${activeView}` : 'Save Set List'}
            </button>
            {instruments.length > 0 && (
              <button
                onClick={handleSaveAll}
                disabled={savingAll}
                title={`Export the main setlist and every instrument view in one go — ${instruments.length + 1} .4ss files`}
                className="btn-secondary text-xs px-2.5 py-1.5 rounded-md disabled:opacity-50"
              >
                {savingAll ? 'Saving…' : `Save All (${instruments.length + 1})`}
              </button>
            )}
            {savedAllMsg && <span className="text-emerald-400 text-xs">{savedAllMsg}</span>}
            {/* Songs are added, reordered, and re-matched on the main setlist;
                instrument views follow it automatically. */}
            {!activeView && (
              <>
                <button onClick={() => { rematchSetlist(id); load(); }} title="Re-run automatic matching for all songs against your library" className="btn-secondary text-xs px-2.5 py-1.5 rounded-md">Re-match</button>
                <button onClick={enterEditMode} title="Drag and drop to change the song order." className="btn-secondary text-xs px-2.5 py-1.5 rounded-md">Edit Order</button>
              </>
            )}
            <button onClick={handlePrint} title="Open a print-friendly version of this setlist" className="btn-secondary text-xs px-2.5 py-1.5 rounded-md">Print</button>
            {!activeView && (
              <button
                onClick={() => setShowSepInput(v => !v)}
                title="Add a section separator (e.g. 'First Half', 'Dinner Break') to divide the setlist"
                className={`text-xs px-2.5 py-1.5 rounded-md ${showSepInput ? 'bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/30' : 'btn-secondary'}`}
              >+ Separator</button>
            )}
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
              <button onClick={handleAddSeparator} className="btn-primary text-xs px-3 py-1">Add</button>
              <button onClick={() => { setShowSepInput(false); setSepTitle(''); }} className="btn-ghost text-xs px-2 py-1">✕</button>
            </div>
          )}

          {/* ── Add song search box (add-only, main setlist) ── */}
          {!activeView && (
            <div className="mt-2.5">
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
          )}
          {activeView && (
            <p className="mt-2 text-[11px] text-zinc-500">
              Follows the main setlist. Songs are added and reordered on the Main tab.
            </p>
          )}
        </div>

        {/* ── Add-song search results — clearly separated "add" zone ── */}
        {!activeView && addQuery.length >= 1 && (
          <div className="flex-shrink-0 border-b border-zinc-800 bg-zinc-900 overflow-y-auto" style={{ maxHeight: '40%' }}>
            <div className="px-3 pt-2 pb-1">
              <span className="text-[10px] font-semibold text-amber-300/90 uppercase tracking-widest">Add to setlist</span>
            </div>
            {addResults.length === 0 ? (
              <div className="px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs text-zinc-500">No library match for &ldquo;{addQuery}&rdquo;</span>
                <button onClick={handleAddByName} className="btn-secondary text-xs px-2 py-1 rounded">
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
                      className={`flex items-stretch border-b border-zinc-800/60 ${isPreviewing ? 'bg-zinc-800/70' : 'hover:bg-zinc-800/50'}`}
                    >
                      {/* View area — click to preview PDF */}
                      <button
                        onClick={() => { setPreviewScore(score); setMobilePane('pdf'); }}
                        className="flex-1 text-left px-3 py-2 bg-transparent border-0 rounded-none"
                        title="Preview this score's PDF in the right panel"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm truncate flex-1 text-zinc-100">{score.display_title}</span>
                          {score.detected_key && <span className="chip-key">{score.detected_key}</span>}
                          {score.version_label && <span className="chip-inst">{score.version_label}</span>}
                          {isPreviewing && <span className="text-xs text-amber-300 flex-shrink-0">▶</span>}
                        </div>
                        <span className="text-xs text-zinc-600 block truncate mt-0.5">{score.forscore_path}</span>
                      </button>
                      {/* Add button */}
                      <button
                        onClick={() => handleAddResult(score)}
                        className="flex-shrink-0 px-3 border-l border-zinc-800 bg-transparent hover:bg-amber-400 text-amber-300 hover:text-zinc-950 text-xs font-semibold transition-colors rounded-none"
                      >
                        + Add
                      </button>
                    </div>
                  );
                })}
                <button
                  onClick={handleAddByName}
                  className="block w-full text-left px-3 py-2 bg-transparent border-0 hover:bg-zinc-800/50 text-zinc-500 hover:text-amber-300 rounded-none"
                >
                  <span className="text-xs">+ Add </span>
                  <span className="text-xs font-semibold">&ldquo;{addQuery}&rdquo;</span>
                  <span className="text-xs text-zinc-600"> as unmatched (no PDF)</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Instrument view list — resolved score per song, read-only structure ── */}
        {activeView && (
          <div className="flex-1 overflow-y-auto">
            {viewParts.map((part, index) => {
              const isSelected = selectedItem?.id === part.item_id;
              const isPicking = overrideFor === part.item_id;

              if (part.is_separator) {
                return (
                  <div key={part.item_id} className="px-3 py-1.5 bg-zinc-900/80 border-b border-zinc-800/60">
                    <p className="text-xs text-zinc-400 italic truncate">{part.requested_title}</p>
                  </div>
                );
              }

              const badge = {
                manual:   'bg-sky-400/10 text-sky-300 ring-sky-400/25',
                exact:    'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25',
                family:   'bg-violet-400/10 text-violet-300 ring-violet-400/25',
                generic:  'bg-zinc-400/10 text-zinc-400 ring-zinc-400/20',
                fallback: 'bg-amber-400/10 text-amber-300 ring-amber-400/25',
                missing:  'bg-red-400/10 text-red-300 ring-red-400/25',
              }[part.source];

              const label = {
                manual: 'Chosen', exact: activeView, family: 'Section',
                generic: 'Shared', fallback: 'Readable', missing: 'Missing',
              }[part.source];

              return (
                <div
                  key={part.item_id}
                  className={`border-b border-zinc-800/60 transition-colors ${
                    isSelected ? 'bg-zinc-800/50 border-l-2 border-l-amber-400' : 'border-l-2 border-l-transparent hover:bg-zinc-900'
                  }`}
                >
                  <div
                    className="flex items-center gap-2 px-2 py-2 cursor-pointer"
                    onClick={() => {
                      // chartInstrument syncs to activeView automatically, which
                      // resolves this song's score for the tab's instrument —
                      // including showing the "missing" state honestly.
                      setSelectedItem(items.find(i => i.id === part.item_id) ?? null);
                      setMobilePane('pdf');
                    }}
                  >
                    <span className="text-zinc-500 text-xs w-5 flex-shrink-0 text-right tabular-nums">{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate font-medium text-zinc-100">{part.requested_title}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {part.display_title ? `→ ${part.display_title}` : part.reason}
                      </p>
                    </div>
                    <span
                      title={part.reason}
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ring-inset flex-shrink-0 ${badge}`}
                    >
                      {label}
                    </span>
                  </div>

                  <div className="flex items-center gap-0.5 px-2 pb-1.5">
                    <button
                      onClick={() => openOverridePicker(part.item_id)}
                      title={`Pick which score the ${activeView} player gets for this song`}
                      className={`text-[11px] px-2 py-1 rounded ${isPicking ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 bg-transparent'}`}
                    >
                      {isPicking ? '✕ Close' : 'Choose…'}
                    </button>
                    {part.source === 'manual' && (
                      <button
                        onClick={() => resetOverride(part.item_id)}
                        title="Go back to automatic detection for this song"
                        className="text-[11px] px-2 py-1 rounded text-zinc-500 hover:text-amber-300 hover:bg-zinc-800 bg-transparent"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  {/* Override picker — this song's variations first */}
                  {isPicking && (
                    <div className="mx-2 mb-2 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/40 overflow-hidden">
                      <div className="px-3 py-2 bg-zinc-800/80 border-b border-zinc-700/60">
                        <span className="text-xs text-zinc-400">
                          {activeView} score for <span className="font-semibold text-amber-300">{part.requested_title}</span>
                        </span>
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        {overrideChoices.length === 0 && (
                          <p className="text-xs text-zinc-500 px-3 py-2.5">No other versions of this song in your library.</p>
                        )}
                        {overrideChoices.map(score => (
                          <div
                            key={score.id}
                            className={`flex items-stretch border-b border-zinc-800/60 last:border-b-0 ${score.id === part.score_id ? 'bg-zinc-800/70' : 'hover:bg-zinc-800/50'}`}
                          >
                            <button
                              onClick={() => { setPreviewScore(score); setMobilePane('pdf'); }}
                              className="flex-1 text-left px-3 py-2 bg-transparent border-0 rounded-none"
                              title="Preview this score"
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-sm truncate flex-1 text-zinc-100">{score.display_title}</span>
                                {score.detected_key && <span className="chip-key">{score.detected_key}</span>}
                                <span className="chip-inst">{score.version_label || 'Generic'}</span>
                              </div>
                            </button>
                            <button
                              onClick={() => chooseOverride(part.item_id, score.id)}
                              className="flex-shrink-0 px-3 border-l border-zinc-800 bg-transparent hover:bg-emerald-500 text-emerald-300 hover:text-zinc-950 text-xs font-semibold transition-colors whitespace-nowrap rounded-none"
                              title={`Use this score for ${activeView}`}
                            >
                              Use ✓
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Item list ── */}
        {!activeView && (
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
                className={`border-b border-zinc-800/60 transition-colors ${
                  isSearching || isSelected
                    ? 'bg-zinc-800/50 border-l-2 border-l-amber-400'
                    : 'border-l-2 border-l-transparent hover:bg-zinc-900'
                } ${isSeparator && !isSearching && !isSelected ? 'bg-zinc-900/80' : ''}`}
              >
                {/* Main row */}
                <div
                  className="flex items-center gap-2 px-2 py-2 cursor-pointer"
                  onClick={() => {
                    setStatusPickerFor(null);
                    if (item.matched_forscore_path) {
                      setSelectedItem(item);
                      setMobilePane('pdf');
                      if (isSearching) setPreviewScore(null);
                    }
                  }}
                >
                  <span className="text-zinc-600 text-base flex-shrink-0 cursor-grab">⠿</span>
                  <span className="text-zinc-500 text-xs w-5 flex-shrink-0 text-right tabular-nums">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate font-medium ${isSeparator ? 'text-zinc-400 italic' : 'text-zinc-100'}`}>
                      {item.requested_title}
                    </p>
                    {item.matched_display_title && item.matched_display_title !== item.requested_title && (
                      <p className="text-xs text-zinc-500 truncate">→ {item.matched_display_title}</p>
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
                        <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl shadow-black/50 z-40 py-1 min-w-[150px]">
                          {[
                            { status: 'matched', label: '✓ Confirmed', color: 'text-emerald-300 hover:bg-emerald-400/10' },
                            { status: 'needs_review', label: '⚠ Needs Review', color: 'text-amber-300 hover:bg-amber-400/10' },
                            { status: 'missing', label: '✕ No Match', color: 'text-red-300 hover:bg-red-400/10' },
                          ].map(opt => (
                            <button
                              key={opt.status}
                              onClick={() => handleUpdateItem(item.id, item.matched_score_id, opt.status)}
                              className={`block w-full text-left px-3 py-1.5 text-xs font-medium bg-transparent border-0 rounded-none ${opt.color} ${item.match_status === opt.status ? 'font-bold' : ''}`}
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
                      onClick={() => { setSelectedItem(item); setStatusPickerFor(null); setMobilePane('pdf'); if (isSearching) setPreviewScore(null); }}
                      title="Show this song's chart in the right panel"
                      className={`text-[11px] px-2 py-1 rounded ${isSelected && !previewScore ? 'text-amber-300 bg-amber-400/10' : 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 bg-transparent'}`}
                    >
                      {isSelected && !previewScore ? '▶ Viewing' : 'View'}
                    </button>
                  )}
                  <button
                    onClick={() => isSearching ? closeInlineSearch() : openInlineSearch(item)}
                    title={isSearching ? 'Close search panel' : 'Search your library to manually pick which score this song maps to'}
                    className={`text-[11px] px-2 py-1 rounded ${isSearching ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 bg-transparent'}`}
                  >
                    {isSearching ? '✕ Close' : 'Search'}
                  </button>
                  <button
                    onClick={() => handleUpdateItem(item.id, null, 'placeholder')}
                    title="Convert to a section separator — appears as a divider in forScore"
                    className="text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 bg-transparent text-[11px] px-2 py-1 rounded"
                  >
                    Sep.
                  </button>
                  {item.matched_score_id && (
                    aliasSavedFor === item.id ? (
                      <span className="text-emerald-400 text-[11px] px-2 py-1">Saved ✓</span>
                    ) : (
                      <button
                        onClick={() => handleAddAliasFromItem(item)}
                        title={`Save "${item.requested_title}" as an alias — future setlists will match it automatically`}
                        className="text-zinc-500 hover:text-emerald-300 hover:bg-emerald-400/10 bg-transparent text-[11px] px-2 py-1 rounded"
                      >
                        Alias
                      </button>
                    )
                  )}
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    title="Remove this song from the setlist"
                    className="text-zinc-600 hover:text-red-400 hover:bg-red-400/10 bg-transparent text-[11px] px-2 py-1 rounded ml-auto"
                  >
                    ✕
                  </button>
                </div>

                {/* ── Inline search panel — appears below this item row ── */}
                {isSearching && (
                  <div className="mx-2 mb-2 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/40 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/80 border-b border-zinc-700/60">
                      <span className="text-xs text-zinc-400 flex-1">
                        Find a match for: <span className="font-semibold text-amber-300">{item.requested_title}</span>
                      </span>
                      <button
                        onClick={closeInlineSearch}
                        className="text-zinc-500 hover:text-zinc-100 bg-transparent border-0 p-0 text-sm leading-none"
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
                    <div className="max-h-56 overflow-y-auto border-t border-zinc-800">
                      {itemResults.length === 0 && itemQuery.length > 0 && (
                        <p className="text-xs text-zinc-500 px-3 py-2.5">No matches found for &ldquo;{itemQuery}&rdquo;</p>
                      )}
                      {itemResults.length === 0 && itemQuery.length === 0 && (
                        <p className="text-xs text-zinc-500 px-3 py-2.5">Start typing to search your library…</p>
                      )}
                      {itemResults.map(score => {
                        const isPreviewing = previewScore?.forscore_path === score.forscore_path;
                        return (
                          <div
                            key={score.id}
                            className={`flex items-stretch border-b border-zinc-800/60 last:border-b-0 ${isPreviewing ? 'bg-zinc-800/70' : 'hover:bg-zinc-800/50'}`}
                          >
                            {/* Click row to preview PDF */}
                            <button
                              onClick={() => { setPreviewScore(score); setMobilePane('pdf'); }}
                              className="flex-1 text-left px-3 py-2 bg-transparent border-0 rounded-none"
                              title="Preview this score's PDF in the right panel"
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-sm truncate flex-1 text-zinc-100">{score.display_title}</span>
                                {score.detected_key && <span className="chip-key">{score.detected_key}</span>}
                                {score.version_label && <span className="chip-inst">{score.version_label}</span>}
                                {isPreviewing && <span className="text-xs text-amber-300 ml-1 flex-shrink-0">▶</span>}
                              </div>
                            </button>
                            {/* Assign button */}
                            <button
                              onClick={() => handleAssignScore(item.id, score)}
                              className="flex-shrink-0 px-3 border-l border-zinc-800 bg-transparent hover:bg-emerald-500 text-emerald-300 hover:text-zinc-950 text-xs font-semibold transition-colors whitespace-nowrap rounded-none"
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
        )}
      </div>

      {/* ── Right: PDF viewer — full screen on phones while viewing ──────── */}
      <div className={`flex-col flex-1 overflow-hidden ${mobilePane === 'pdf' ? 'flex' : 'hidden md:flex'}`}>

        {/* Preview banner — shown when browsing search results */}
        {previewScore && (
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-amber-400/10 border-b border-amber-400/20 text-amber-200 text-xs">
            <button
              onClick={() => setMobilePane('list')}
              title="Back to the setlist"
              className="md:hidden text-amber-300 bg-transparent border-0 p-0 pr-1 text-sm font-medium flex-shrink-0"
            >
              ‹ Setlist
            </button>
            <span className="font-semibold truncate flex-1">Previewing: {previewScore.display_title}</span>
            {searchingFor ? (
              <button
                onClick={() => { handleAssignScore(searchingFor, previewScore); setMobilePane('list'); }}
                className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs px-2.5 py-1 rounded font-semibold flex-shrink-0"
              >
                Assign ✓
              </button>
            ) : (
              <button
                onClick={() => { handleAddResult(previewScore); setMobilePane('list'); }}
                className="bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs px-2.5 py-1 rounded font-semibold flex-shrink-0"
              >
                + Add
              </button>
            )}
          </div>
        )}

        {/* Header strip: song title + key/instrument badges + Edit toggle */}
        {selectedItem && !previewScore && (
          <div className="flex-shrink-0 border-b border-zinc-800 bg-zinc-900">
            {/* Top row */}
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                onClick={() => setMobilePane('list')}
                title="Back to the setlist"
                className="md:hidden text-amber-300 bg-transparent border-0 p-0 pr-1 text-sm font-medium flex-shrink-0"
              >
                ‹ Setlist
              </button>
              <div className="flex-1 min-w-0">
                {/* Song name with ✎ shortcut to edit display title */}
                <div className="flex items-center gap-1 group/title">
                  <p className="font-semibold text-sm truncate text-zinc-100">{selectedItem.requested_title}</p>
                  {selectedScore && (
                    <button
                      onClick={handleEditTitle}
                      title="Edit this score's display title"
                      className="text-zinc-600 hover:text-amber-300 opacity-0 group-hover/title:opacity-100 text-xs bg-transparent border-0 p-0 flex-shrink-0"
                    >✎</button>
                  )}
                </div>
                {/* File title (if different) with its own ✎ — reflects whichever
                    instrument's chart is on screen, not always Main's match */}
                {selectedScore && selectedScore.display_title !== selectedItem.requested_title && (
                  <div className="flex items-center gap-1 group/filetitle">
                    <p className="text-xs text-zinc-500 truncate">→ {selectedScore.display_title}</p>
                    <button
                      onClick={handleEditTitle}
                      title="Edit the file's display title"
                      className="text-zinc-600 hover:text-amber-300 opacity-0 group-hover/filetitle:opacity-100 text-xs bg-transparent border-0 p-0 flex-shrink-0"
                    >✎</button>
                  </div>
                )}
                {!selectedScore && chartInstrument && (
                  <p className="text-xs text-red-400/80 truncate">No {chartInstrument} chart for this song</p>
                )}
              </div>
              {selectedScore?.detected_key && <span className="chip-key">{selectedScore.detected_key}</span>}
              {selectedScore?.version_label && <span className="chip-inst">{selectedScore.version_label}</span>}
              {selectedScore && (
                <button
                  onClick={() => { setShowScoreEdit(v => !v); setScoreSaved(false); }}
                  title="Edit this score's key, instrument, and status"
                  className={`flex-shrink-0 text-xs px-2.5 py-1.5 rounded-lg ${showScoreEdit ? 'bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/30' : 'btn-secondary'}`}
                >
                  Edit
                </button>
              )}
            </div>

            {/* Quick chart switcher — jump between this song's instrument
                parts without leaving the current tab or re-searching */}
            {instruments.length > 0 && (
              <div className="flex items-center gap-1 px-3 pb-2 flex-wrap">
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider mr-0.5 flex-shrink-0">Chart:</span>
                <button
                  onClick={() => setChartInstrument(null)}
                  title="This song's main matched score"
                  className={`text-[11px] px-2 py-1 rounded-md flex-shrink-0 ${chartInstrument === null ? 'bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/30' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 bg-transparent'}`}
                >
                  Main
                </button>
                {instruments.map(name => {
                  const opt = chartOptions[name];
                  return (
                    <button
                      key={name}
                      onClick={() => setChartInstrument(name)}
                      title={opt ? opt.reason : `Switch to the ${name} chart for this song`}
                      className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md flex-shrink-0 ${chartInstrument === name ? 'bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/30' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 bg-transparent'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${opt ? DOT_COLOR[opt.source] : 'bg-zinc-600'}`} />
                      {name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Edit form — identical layout to Library page */}
            {showScoreEdit && selectedScore && (
              <div className="border-t border-zinc-800 bg-zinc-900 p-3">
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Display Title</label>
                    <input
                      ref={displayTitleRef}
                      type="text"
                      value={scoreEdit.display_title}
                      onChange={e => setScoreEdit(f => ({ ...f, display_title: e.target.value }))}
                      className="w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Status</label>
                    <select value={scoreEdit.status} onChange={e => setScoreEdit(f => ({ ...f, status: e.target.value }))} className="w-full text-sm">
                      <option value="new">New</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="unknown">Unknown</option>
                      <option value="duplicate">Duplicate</option>
                      <option value="ignored">Ignored</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Key</label>
                    <select value={scoreEdit.detected_key} onChange={e => setScoreEdit(f => ({ ...f, detected_key: e.target.value }))} className="w-full text-sm">
                      {KEYS.map(k => <option key={k} value={k}>{k || '— not set —'}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Instrument</label>
                    <select value={scoreEdit.version_label} onChange={e => setScoreEdit(f => ({ ...f, version_label: e.target.value }))} className="w-full text-sm">
                      {INSTRUMENTS.map(i => <option key={i} value={i === 'Generic' ? '' : i}>{i}</option>)}
                    </select>
                  </div>
                </div>

                {/* Notes — full-width, separate from the metadata grid */}
                <div className="border-t border-zinc-800 pt-2 mt-1 mb-2.5">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Notes / Comments</label>
                  <textarea
                    value={scoreEdit.notes}
                    onChange={e => setScoreEdit(f => ({ ...f, notes: e.target.value }))}
                    placeholder="e.g. who this is for, special instructions, reminders…"
                    rows={2}
                    className="w-full text-sm resize-none"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleScoreSaveAndPdf}
                    disabled={pdfSaving}
                    title="Save to app AND write title + key into the PDF file — forScore will pick these up automatically"
                    className="btn-primary disabled:opacity-50 text-sm px-4 py-1.5"
                  >{pdfSaving ? 'Updating PDF…' : 'Save + update PDF'}</button>
                  <button
                    onClick={handleScoreSave}
                    title="Save key, title, notes to this app only (forScore will not be affected)"
                    className="btn-secondary text-sm px-4 py-1.5"
                  >Save to app</button>
                  <button onClick={() => setAliasModal(selectedScore)} title="Add an alternate name for this score — useful when a setlist uses a different title" className="btn-ghost text-sm px-3 py-1.5">+ Alias</button>
                  {scoreSaved && !pdfSaved && <span className="text-emerald-400 text-sm">Saved ✓</span>}
                  {pdfSaved && <span className="text-amber-300 text-sm font-medium">Saved + PDF updated ✓</span>}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <InlinePdfViewer
            filename={previewScore?.forscore_path ?? selectedScore?.forscore_path ?? null}
            placeholder={
              chartInstrument && selectedItem && !selectedScore ? (
                <div className="text-center text-zinc-500">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 mx-auto mb-4 text-zinc-700">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  <p className="text-sm font-medium text-zinc-400">No {chartInstrument} chart</p>
                  <p className="text-xs mt-1 text-zinc-600 max-w-xs mx-auto">
                    Use Choose… on the {chartInstrument} tab to pick one for &ldquo;{selectedItem.requested_title}&rdquo;
                  </p>
                </div>
              ) : (
                <div className="text-center text-zinc-500">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 mx-auto mb-4 text-zinc-700">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  <p className="text-sm font-medium text-zinc-400">Tap a matched song</p>
                  <p className="text-xs mt-1 text-zinc-600">The chart will appear here</p>
                </div>
              )
            }
          />
        </div>
      </div>
    </div>
    </div>

    {/* ── Alias modal — identical to Library page ──────────────────────── */}
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
    </>
  );
}
