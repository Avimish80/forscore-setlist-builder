import { SetlistItem, Score } from './types';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface ExportItem {
  requested_title: string;
  match_status: string;
  matched_score?: {
    display_title: string;
    forscore_path: string;
  } | null;
}

export function generateSetlistXml(name: string, items: ExportItem[]): string {
  const scoreLines = items.map(item => {
    if (item.match_status === 'placeholder' || !item.matched_score) {
      return `  <placeholder title="${escapeXml(item.requested_title)}" />`;
    }
    return `  <score title="${escapeXml(item.requested_title)}" path="${escapeXml(item.matched_score.forscore_path)}" />`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<forScore kind="setlist" version="1.0" title="${escapeXml(name)}">`,
    ...scoreLines,
    '</forScore>',
    '',
  ].join('\n');
}
