'use client';

import { useState, useEffect, useMemo } from 'react';
import { getScoreGroups, updateScore } from '@/lib/data';

const INSTRUMENTS = [
  'Generic', 'Lead Sheet', 'Piano', 'Piano/Vocal', 'Guitar', 'Bass',
  'Violin', 'Viola', 'Cello', 'Drums', 'Saxophone', 'Alto Sax', 'Tenor Sax',
  'Trumpet', 'Trombone', 'Flute', 'Clarinet', 'Horns', 'Strings', 'Full Score', 'Other',
];

const KEYS = [
  '', 'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Abm', 'Am', 'A#m', 'Bbm', 'Bm',
];

type Member = {
  id: number;
  display_title: string;
  normalized_title: string;
  detected_key: string | null;
  version_label: string | null;
  status: string;
  original_filename: string;
};

type Group = {
  core_title: string;
  count: number;
  members: Member[];
  all_reviewed: boolean;
};

type Edit = {
  display_title: string;
  detected_key: string;
  version_label: string;
  status: string;
};

type FilterMode = 'all' | 'multi' | 'unreviewed';

export default function WorkbenchPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Group | null>(null);

  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [canonicalTitle, setCanonicalTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');

  useEffect(() => {
    setGroups(getScoreGroups());
    setLoading(false);
  }, []);

  const filteredGroups = useMemo(() => {
    let g = groups;
    if (filter === 'multi') g = g.filter(grp => grp.count > 1);
    if (filter === 'unreviewed') g = g.filter(grp => !grp.all_reviewed);
    if (search.trim()) {
      const q = search.toLowerCase();
      g = g.filter(grp =>
        grp.core_title.includes(q) ||
        grp.members.some(m => m.display_title.toLowerCase().includes(q))
      );
    }
    return g;
  }, [groups, filter, search]);

  function selectGroup(grp: Group) {
    setSelected(grp);
    setCanonicalTitle(grp.members[0].display_title);
    const init: Record<number, Edit> = {};
    for (const m of grp.members) {
      init[m.id] = {
        display_title: m.display_title,
        detected_key: m.detected_key ?? '',
        version_label: m.version_label ?? '',
        status: m.status,
      };
    }
    setEdits(init);
    setSavedMsg(false);
  }

  function setField(id: number, field: keyof Edit, value: string) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  function applyTitleToAll() {
    if (!selected) return;
    setEdits(prev => {
      const next = { ...prev };
      for (const m of selected.members) {
        next[m.id] = { ...next[m.id], display_title: canonicalTitle };
      }
      return next;
    });
  }

  function markAllReviewed() {
    if (!selected) return;
    setEdits(prev => {
      const next = { ...prev };
      for (const m of selected.members) {
        next[m.id] = { ...next[m.id], status: 'reviewed' };
      }
      return next;
    });
  }

  function handleSaveAll() {
    if (!selected) return;
    setSaving(true);

    for (const m of selected.members) {
      const edit = edits[m.id];
      if (edit) updateScore(m.id, edit);
    }

    setGroups(prev =>
      prev.map(grp => {
        if (grp.core_title !== selected.core_title) return grp;
        const updatedMembers = grp.members.map(m => ({ ...m, ...(edits[m.id] ?? {}) }));
        return { ...grp, members: updatedMembers, all_reviewed: updatedMembers.every(m2 => m2.status === 'reviewed') };
      })
    );

    setSaving(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  }

  const multiCount = groups.filter(g => g.count > 1).length;
  const unreviewedCount = groups.filter(g => !g.all_reviewed).length;

  return (
    <div className="flex h-[calc(100vh-48px)] overflow-hidden">

      {/* ── Left: group list ── */}
      <div className={`flex flex-col border-r overflow-hidden transition-all ${selected ? 'w-[36%]' : 'w-full max-w-3xl'}`}>
        <div className="p-4 border-b shrink-0 bg-white">
          <h1 className="text-xl font-bold mb-3">Workbench</h1>
          <div className="flex gap-1 mb-3 flex-wrap">
            {([
              ['all', `All (${groups.length})`],
              ['multi', `Multi-version (${multiCount})`],
              ['unreviewed', `Needs Review (${unreviewedCount})`],
            ] as [FilterMode, string][]).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded text-xs font-medium ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Search songs…" value={search} onChange={e => setSearch(e.target.value)} className="w-full text-sm" />
          <p className="text-xs text-gray-400 mt-1.5">
            {loading ? 'Loading groups…' : `${filteredGroups.length} song groups`}
          </p>
        </div>

        <div className="overflow-y-auto flex-1">
          {filteredGroups.map(grp => {
            const isSelected = selected?.core_title === grp.core_title;
            const instruments = [...new Set(grp.members.map(m => m.version_label).filter(Boolean))] as string[];
            const keys = [...new Set(grp.members.map(m => m.detected_key).filter(Boolean))] as string[];
            return (
              <div
                key={grp.core_title}
                onClick={() => selectGroup(grp)}
                className={`px-3 py-2.5 border-b cursor-pointer hover:bg-blue-50 ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm leading-snug">{grp.members[0].display_title}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {grp.count > 1 && <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded font-semibold">{grp.count}</span>}
                    {grp.all_reviewed
                      ? <span className="text-green-500 text-xs font-medium">✓</span>
                      : <span className="text-orange-400 text-xs">○</span>}
                  </div>
                </div>
                {(instruments.length > 0 || keys.length > 0) && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {instruments.map(v => <span key={v} className="bg-gray-100 text-gray-600 text-xs px-1 py-0.5 rounded">{v}</span>)}
                    {keys.map(k => <span key={k} className="bg-amber-100 text-amber-700 text-xs px-1 py-0.5 rounded">{k}</span>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: group detail ── */}
      {selected && (
        <div className="flex flex-col flex-1 overflow-hidden bg-white">
          <div className="shrink-0 px-4 py-2.5 border-b bg-gray-50 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{selected.members[0].display_title}</p>
              <p className="text-xs text-gray-400">{selected.count} version{selected.count !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {savedMsg && <span className="text-green-600 text-xs">Saved ✓</span>}
              <button onClick={markAllReviewed} className="text-xs bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-2 py-1">Mark All Reviewed</button>
              <button onClick={handleSaveAll} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50 px-3 py-1.5">{saving ? 'Saving…' : 'Save All'}</button>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 bg-transparent text-lg leading-none">✕</button>
            </div>
          </div>

          <div className="shrink-0 px-4 py-2 border-b bg-white flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500 whitespace-nowrap">Canonical title:</label>
            <input type="text" value={canonicalTitle} onChange={e => setCanonicalTitle(e.target.value)} className="flex-1 text-sm" />
            <button onClick={applyTitleToAll} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 whitespace-nowrap">Apply to All</button>
          </div>

          <div className="overflow-y-auto flex-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[28%]">Filename</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[22%]">Title</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[18%]">Instrument</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[10%]">Key</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[12%]">Status</th>
                  <th className="px-3 py-2 w-[10%]"></th>
                </tr>
              </thead>
              <tbody>
                {selected.members.map(m => {
                  const edit = edits[m.id];
                  return (
                    <tr key={m.id} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-xs text-gray-400 truncate max-w-0">
                        <span className="block truncate" title={m.original_filename}>{m.original_filename}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="text" value={edit?.display_title ?? m.display_title} onChange={e => setField(m.id, 'display_title', e.target.value)} className="text-sm w-full" />
                      </td>
                      <td className="px-3 py-1.5">
                        <select value={edit?.version_label ?? m.version_label ?? ''} onChange={e => setField(m.id, 'version_label', e.target.value)} className="text-xs w-full">
                          {INSTRUMENTS.map(i => <option key={i} value={i === 'Generic' ? '' : i}>{i}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <select value={edit?.detected_key ?? m.detected_key ?? ''} onChange={e => setField(m.id, 'detected_key', e.target.value)} className="text-xs w-full">
                          {KEYS.map(k => <option key={k} value={k}>{k || '—'}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <select value={edit?.status ?? m.status} onChange={e => setField(m.id, 'status', e.target.value)} className="text-xs w-full">
                          <option value="new">New</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="unknown">Unknown</option>
                          <option value="duplicate">Duplicate</option>
                          <option value="ignored">Ignored</option>
                        </select>
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <a
                          href={`forscore://score?title=${encodeURIComponent(edit?.display_title ?? m.display_title)}`}
                          className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1"
                        >
                          forScore
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
