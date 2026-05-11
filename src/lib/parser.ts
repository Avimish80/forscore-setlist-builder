export interface ParsedSetlist {
  name: string;
  items: string[];
}

export function parseSetlistText(text: string): ParsedSetlist {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  if (lines.length === 0) {
    return { name: 'Untitled Setlist', items: [] };
  }

  const firstLine = lines[0];
  const hasNumberedSongs = lines.slice(1).some(l => /^\d+[\.\)\-\s]/.test(l));
  const firstLineIsTitle = !(/^\d+[\.\)\-\s]/.test(firstLine)) && hasNumberedSongs;

  let name: string;
  let songLines: string[];

  if (firstLineIsTitle || lines.length === 1) {
    name = firstLine;
    songLines = lines.slice(1);
  } else {
    name = 'Untitled Setlist';
    songLines = lines;
  }

  const items = songLines.map(line => {
    return line
      .replace(/^\d+[\.\)\-:\s]+/, '')
      .trim();
  }).filter(Boolean);

  return { name, items };
}
