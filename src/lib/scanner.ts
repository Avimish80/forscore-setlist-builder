import fs from 'fs';
import path from 'path';
import { ScannedFile } from './types';

export function scanFolder(folderPath: string): ScannedFile[] {
  const results: ScannedFile[] = [];
  const absRoot = path.resolve(folderPath);

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        if (entry.name.startsWith('.')) continue;
        const stat = fs.statSync(fullPath);
        results.push({
          original_filename: entry.name,
          original_relative_path: path.relative(absRoot, fullPath),
          original_absolute_path: fullPath,
          file_size: stat.size,
          modified_at: stat.mtime.toISOString(),
        });
      }
    }
  }

  walk(absRoot);
  return results;
}
