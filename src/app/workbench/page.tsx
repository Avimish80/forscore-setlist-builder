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
    <div className="flex h-full overflow-hidden">

      {/* ── Left: group list — full width on phones; hides when a group is open ── */}
      <div className={`flex-col border-r border-zinc-800 overflow-hidden transition-all ${selected ? 'w-full md:w-[36%] hidden md:flex' : 'w-full max-w-3xl flex'}`}>
        <div className="p-4 border-b border-zinc-800 shrink-0 bg-zinc-950">
          <h1 className="text-xl font-bold tracking-tight mb-3">Workbench</h1>
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {([
              ['all', `All (${groups.length})`],
              ['multi', `Multi-version (${multiCount})`],
              ['unreviewed', `Needs Review (${unreviewedCount})`],
            ] as [FilterMode, string][]).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium ${filter === f ? 'bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/30' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 bg-transparent'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Search songs…" value={search} onChange={e => setSearch(e.target.value)} className="w-full text-sm" />
          <p className="text-xs text-zinc-500 mt-2">
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
                className={`px-3 py-2.5 border-b border-zinc-800/60 cursor-pointer transition-colors ${isSelected ? 'bg-zinc-800/50 border-l-2 border-l-amber-400' : 'border-l-2 border-l-transparent hover:bg-zinc-900'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm leading-snug text-zinc-100">{grp.members[0].display_title}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {grp.count > 1 && <span className="bg-zinc-700/70 text-zinc-200 text-[11px] px-1.5 py-0.5 rounded font-semibold tabular-nums">{grp.count}</span>}
                    {grp.all_reviewed
                      ? <span className="text-emerald-400 text-xs font-medium">✓</span>
                      : <span className="text-amber-400/70 text-xs">○</span>}
                  </div>
                </div>
                {(instruments.length > 0 || keys.length > 0) && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {instruments.map(v => <span key={v} className="chip-inst">{v}</span>)}
                    {keys.map(k => <span key={k} className="chip-key">{k}</span>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: group detail ── */}
      {selected && (
        <div className="flex flex-col flex-1 overflow-hidden bg-zinc-950">
          <div className="shrink-0 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between gap-3">
            <button
              onClick={() => setSelected(null)}
              title="Back to the group list"
              className="md:hidden text-amber-300 bg-transparent border-0 p-0 pr-1 text-sm font-medium shrink-0"
            >
              ‹ List
            </button>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate text-zinc-100">{selected.members[0].display_title}</p>
              <p className="text-xs text-zinc-500">{selected.count} version{selected.count !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {savedMsg && <span className="text-emerald-400 text-xs">Saved ✓</span>}
              <button onClick={markAllReviewed} title="Set every version in this group to 'Reviewed' status" className="btn-secondary text-xs px-2.5 py-1.5 text-emerald-300">Mark All Reviewed</button>
              <button onClick={handleSaveAll} disabled={saving} title="Save all edits for every version in this group" className="btn-primary text-sm disabled:opacity-50 px-3.5 py-1.5">{saving ? 'Saving…' : 'Save All'}</button>
              <button onClick={() => setSelected(null)} title="Close the detail panel" className="btn-ghost text-lg leading-none px-2 py-1">✕</button>
            </div>
          </div>

          <div className="shrink-0 px-4 py-2 border-b border-zinc-800 bg-zinc-950 flex items-center gap-2">
            <label className="text-xs font-medium text-zinc-500 whitespace-nowrap">Canonical title:</label>
            <input type="text" value={canonicalTitle} onChange={e => setCanonicalTitle(e.target.value)} className="flex-1 text-sm" />
            <button onClick={applyTitleToAll} title="Copy this title to every version in the group — makes all versions appear under one consistent name" className="btn-secondary text-xs px-2.5 py-1.5 whitespace-nowrap">Apply to All</button>
          </div>

          <div className="overflow-y-auto flex-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="w-[28%]">Filename</th>
                  <th className="w-[22%]">Title</th>
                  <th className="w-[18%]">Instrument</th>
                  <th className="w-[10%]">Key</th>
                  <th className="w-[12%]">Status</th>
                  <th className="w-[10%]"></th>
                </tr>
              </thead>
              <tbody>
                {selected.members.map(m => {
                  const edit = edits[m.id];
                  return (
                    <tr key={m.id} className="hover:bg-zinc-900 transition-colors">
                      <td className="text-xs text-zinc-500 truncate max-w-0">
                        <span className="block truncate" title={m.original_filename}>{m.original_filename}</span>
                      </td>
                      <td className="py-1.5">
                        <input type="text" value={edit?.display_title ?? m.display_title} onChange={e => setField(m.id, 'display_title', e.target.value)} className="text-sm w-full" />
                      </td>
                      <td className="py-1.5">
                        <select value={edit?.version_label ?? m.version_label ?? ''} onChange={e => setField(m.id, 'version_label', e.target.value)} className="text-xs w-full">
                          {INSTRUMENTS.map(i => <option key={i} value={i === 'Generic' ? '' : i}>{i}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5">
                        <select value={edit?.detected_key ?? m.detected_key ?? ''} onChange={e => setField(m.id, 'detected_key', e.target.value)} className="text-xs w-full">
                          {KEYS.map(k => <option key={k} value={k}>{k || '—'}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5">
                        <select value={edit?.status ?? m.status} onChange={e => setField(m.id, 'status', e.target.value)} className="text-xs w-full">
                          <option value="new">New</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="unknown">Unknown</option>
                          <option value="duplicate">Duplicate</option>
                          <option value="ignored">Ignored</option>
                        </select>
                      </td>
                      <td className="text-center">
                        <a
                          href={`forscore://score?title=${encodeURIComponent(edit?.display_title ?? m.display_title)}`}
                          className="text-xs text-amber-300/80 hover:text-amber-200 px-2 py-1"
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
