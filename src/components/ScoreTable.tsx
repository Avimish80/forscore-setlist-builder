'use client';

import { Score } from '@/lib/types';
import StatusBadge from './StatusBadge';

interface Props {
  scores: Score[];
  onEdit: (score: Score) => void;
  onAddAlias?: (score: Score) => void;
  onView?: (score: Score) => void;
  selectedId?: number;
  compact?: boolean;
}

export default function ScoreTable({ scores, onEdit, onAddAlias, onView, selectedId, compact }: Props) {
  if (scores.length === 0) {
    return <p className="text-gray-500 text-sm py-8 text-center">No scores found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Display Title</th>
            {!compact && <th>Original Filename</th>}
            <th>forScore Path</th>
            {!compact && <th>Key</th>}
            {!compact && <th>Version</th>}
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {scores.map(score => (
            <tr
              key={score.id}
              className={`hover:bg-blue-50 cursor-pointer ${selectedId === score.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}
              onClick={() => onView?.(score)}
            >
              <td className="font-medium">{score.display_title}</td>
              {!compact && (
                <td className="text-gray-500 text-xs break-all max-w-xs">{score.original_filename}</td>
              )}
              <td className="text-xs text-gray-600">{score.forscore_path}</td>
              {!compact && <td>{score.detected_key || '—'}</td>}
              {!compact && <td>{score.version_label || '—'}</td>}
              <td><StatusBadge status={score.status} /></td>
              <td>
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  {onView && (
                    <button
                      onClick={() => onView(score)}
                      className="text-indigo-600 hover:text-indigo-800 bg-transparent px-2 py-1 text-xs"
                    >
                      View
                    </button>
                  )}
                  <button
                    onClick={() => onEdit(score)}
                    className="text-blue-600 hover:text-blue-800 bg-transparent px-2 py-1 text-xs"
                  >
                    Edit
                  </button>
                  {onAddAlias && (
                    <button
                      onClick={() => onAddAlias(score)}
                      className="text-green-600 hover:text-green-800 bg-transparent px-2 py-1 text-xs"
                    >
                      + Alias
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
