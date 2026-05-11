'use client';

import { useState } from 'react';
import StatusBadge from './StatusBadge';
import { Score } from '@/lib/types';

interface SetlistItemRow {
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

interface Props {
  items: SetlistItemRow[];
  onUpdateItem: (itemId: number, scoreId: number | null, status: string) => void;
  onCreateAlias: (aliasText: string, scoreId: number) => void;
  onSearchScore: (query: string, callback: (scores: Score[]) => void) => void;
}

export default function SetlistReview({ items, onUpdateItem, onCreateAlias, onSearchScore }: Props) {
  const [searchingFor, setSearchingFor] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Score[]>([]);

  function handleSearch(itemId: number) {
    setSearchingFor(itemId);
    setSearchQuery('');
    setSearchResults([]);
  }

  function doSearch(query: string) {
    setSearchQuery(query);
    if (query.length >= 2) {
      onSearchScore(query, setSearchResults);
    } else {
      setSearchResults([]);
    }
  }

  function selectMatch(itemId: number, score: Score) {
    onUpdateItem(itemId, score.id, 'matched');
    setSearchingFor(null);
  }

  function markPlaceholder(itemId: number) {
    onUpdateItem(itemId, null, 'placeholder');
  }

  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th className="w-12">#</th>
            <th>Requested Song</th>
            <th>Matched Score</th>
            <th className="w-24">Confidence</th>
            <th className="w-28">Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="text-gray-500">{item.position}</td>
              <td className="font-medium">{item.requested_title}</td>
              <td>
                {item.matched_display_title ? (
                  <div>
                    <div className="text-sm">{item.matched_display_title}</div>
                    <div className="text-xs text-gray-400">{item.matched_forscore_path}</div>
                    {item.match_reason && (
                      <div className="text-xs text-gray-400 italic">{item.match_reason}</div>
                    )}
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
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={() => handleSearch(item.id)}
                    className="text-blue-600 hover:text-blue-800 bg-transparent px-2 py-1 text-xs"
                  >
                    Search
                  </button>
                  <button
                    onClick={() => markPlaceholder(item.id)}
                    className="text-purple-600 hover:text-purple-800 bg-transparent px-2 py-1 text-xs"
                  >
                    Placeholder
                  </button>
                  {item.matched_score_id && (
                    <button
                      onClick={() => onCreateAlias(item.requested_title, item.matched_score_id!)}
                      className="text-green-600 hover:text-green-800 bg-transparent px-2 py-1 text-xs"
                    >
                      Save Alias
                    </button>
                  )}
                </div>

                {searchingFor === item.id && (
                  <div className="mt-2 p-2 bg-gray-50 rounded border">
                    <input
                      type="text"
                      placeholder="Search scores..."
                      value={searchQuery}
                      onChange={e => doSearch(e.target.value)}
                      className="w-full mb-2"
                      autoFocus
                    />
                    {searchResults.map(score => (
                      <button
                        key={score.id}
                        onClick={() => selectMatch(item.id, score)}
                        className="block w-full text-left px-2 py-1 text-sm hover:bg-blue-50 rounded bg-transparent"
                      >
                        <span className="font-medium">{score.display_title}</span>
                        <span className="text-gray-400 text-xs ml-2">{score.forscore_path}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => setSearchingFor(null)}
                      className="text-xs text-gray-500 mt-1 bg-transparent"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
