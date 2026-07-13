'use client';

const STYLES: Record<string, { classes: string; label: string }> = {
  new:          { classes: 'bg-sky-400/10 text-sky-300 ring-sky-400/25',         label: 'New' },
  reviewed:     { classes: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25', label: 'Reviewed' },
  unknown:      { classes: 'bg-amber-400/10 text-amber-300 ring-amber-400/25',   label: 'Unknown' },
  duplicate:    { classes: 'bg-orange-400/10 text-orange-300 ring-orange-400/25', label: 'Duplicate' },
  ignored:      { classes: 'bg-zinc-400/10 text-zinc-400 ring-zinc-400/20',      label: 'Ignored' },
  matched:      { classes: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25', label: 'Matched' },
  needs_review: { classes: 'bg-amber-400/10 text-amber-300 ring-amber-400/25',   label: 'Review' },
  missing:      { classes: 'bg-red-400/10 text-red-300 ring-red-400/25',         label: 'Missing' },
  placeholder:  { classes: 'bg-violet-400/10 text-violet-300 ring-violet-400/25', label: 'Section' },
};

export default function StatusBadge({ status }: { status: string }) {
  const s = STYLES[status] ?? { classes: 'bg-zinc-400/10 text-zinc-400 ring-zinc-400/20', label: status.replace('_', ' ') };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ring-inset ${s.classes}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}
