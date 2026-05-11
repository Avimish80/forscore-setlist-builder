# forScore Setlist Builder

A local-first app for scanning your PDF score library, building searchable catalogues, and generating forScore-compatible `.4ss` setlist files.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Workflow

1. **Settings** — set your score folder path
2. **Library** — scan folder, review catalogue, edit titles, add aliases
3. **New Setlist** — paste a setlist, auto-match songs
4. **Review** — confirm matches, search manually, save aliases
5. **Export** — download `.4ss` file for forScore

## Test Data

Sample PDF files are in `test-scores/` for testing. Point the scanner at this folder to try the app.

## Tech Stack

- Next.js 14 (App Router)
- SQLite via better-sqlite3
- Tailwind CSS
- Fuse.js for fuzzy matching

## Safety

- Never modifies or deletes original PDF files
- All file operations are read-only (scanning)
- Copy-based organisation only
- Full audit trail of original filenames in the database
