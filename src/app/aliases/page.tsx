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
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Aliases</h1>
      <p className="text-sm text-gray-500 mb-4">
        Aliases connect typed song names to existing score files.
      </p>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : aliases.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">
          No aliases yet. Add them from the Library or during setlist review.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Alias Text</th>
              <th>Matched Score</th>
              <th>forScore Path</th>
              <th>Source</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {aliases.map(alias => (
              <tr key={alias.id} className="hover:bg-gray-50">
                <td className="font-medium">{alias.alias_text}</td>
                <td>{alias.score_display_title}</td>
                <td className="text-xs text-gray-500">{alias.score_forscore_path}</td>
                <td className="text-xs text-gray-500">{alias.source}</td>
                <td>
                  <button onClick={() => handleDelete(alias.id)} className="text-red-600 hover:text-red-800 bg-transparent px-2 py-1 text-xs">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
