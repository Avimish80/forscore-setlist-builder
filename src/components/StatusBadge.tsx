'use client';

const COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  reviewed: 'bg-green-100 text-green-800',
  unknown: 'bg-yellow-100 text-yellow-800',
  duplicate: 'bg-orange-100 text-orange-800',
  ignored: 'bg-gray-100 text-gray-500',
  matched: 'bg-green-100 text-green-800',
  needs_review: 'bg-yellow-100 text-yellow-800',
  missing: 'bg-red-100 text-red-800',
  placeholder: 'bg-purple-100 text-purple-800',
};

export default function StatusBadge({ status }: { status: string }) {
  const color = COLORS[status] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
