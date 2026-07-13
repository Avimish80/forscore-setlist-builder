'use client';

import { useState, useEffect } from 'react';
import { getAliases, deleteAlias } from '@/lib/data';

interface AliasRow {
  id: number;
  alias_text: string;
  score_id: number;
  source: string;
  confidence: number;
  score_display_title: string;
  score_forscore_path: string;
}

export default function AliasesPage() {
  const [aliases, setAliases] = useState<AliasRow[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setAliases(getAliases() as AliasRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function handleDelete(id: number) {
    deleteAlias(id);
    load();
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold tracking-tight mb-1">Aliases</h1>
        <p className="text-sm text-zinc-500 mb-6">
          Aliases connect typed song names to existing score files.
        </p>

        {loading ? (
          <p className="text-zinc-500">Loading...</p>
        ) : aliases.length === 0 ? (
          <div className="panel py-16 text-center">
            <p className="text-zinc-300 font-medium mb-1">No aliases yet</p>
            <p className="text-zinc-500 text-sm">Add them from the Library or during setlist review.</p>
          </div>
        ) : (
          <div className="panel overflow-hidden">
            <table>
              <thead>
                <tr>
                  <th>Alias Text</th>
                  <th>Matched Score</th>
                  <th>forScore Path</th>
                  <th>Source</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {aliases.map(alias => (
                  <tr key={alias.id} className="hover:bg-zinc-800/50 transition-colors">
                    <td className="font-medium text-zinc-100">{alias.alias_text}</td>
                    <td className="text-zinc-300">{alias.score_display_title}</td>
                    <td className="text-xs text-zinc-500">{alias.score_forscore_path}</td>
                    <td className="text-xs text-zinc-500">{alias.source}</td>
                    <td className="text-right">
                      <button
                        onClick={() => handleDelete(alias.id)}
                        title="Remove this alias — the song name will no longer auto-match this score"
                        className="btn-ghost hover:text-red-400 text-xs px-2 py-1"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
