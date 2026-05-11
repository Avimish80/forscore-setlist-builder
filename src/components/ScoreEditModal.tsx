'use client';

import { useState } from 'react';
import { Score } from '@/lib/types';

interface Props {
  score: Score;
  onClose: () => void;
  onSave: (updated: Partial<Score>) => void;
}

export default function ScoreEditModal({ score, onClose, onSave }: Props) {
  const [displayTitle, setDisplayTitle] = useState(score.display_title);
  const [forscorePath, setForscorePath] = useState(score.forscore_path);
  const [status, setStatus] = useState(score.status);
  const [notes, setNotes] = useState(score.notes || '');

  function handleSave() {
    onSave({
      display_title: displayTitle,
      forscore_path: forscorePath,
      status,
      notes: notes || null,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">Edit Score</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Original Filename</label>
            <div className="text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded break-all">
              {score.original_filename}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Title</label>
            <input
              type="text"
              value={displayTitle}
              onChange={e => setDisplayTitle(e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">forScore Path (filename used in .4ss)</label>
            <input
              type="text"
              value={forscorePath}
              onChange={e => setForscorePath(e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as Score['status'])} className="w-full">
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
              <option value="unknown">Unknown</option>
              <option value="duplicate">Duplicate</option>
              <option value="ignored">Ignored</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="bg-gray-100 hover:bg-gray-200 text-gray-700">
            Cancel
          </button>
          <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
