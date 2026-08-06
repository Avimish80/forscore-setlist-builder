export interface Score {
  id: number;
  original_filename: string;
  original_relative_path: string;
  original_absolute_path: string;
  forscore_path: string;
  display_title: string;
  normalized_title: string;
  detected_key: string | null;
  version_label: string | null;
  file_size: number | null;
  modified_at: string | null;
  status: 'new' | 'reviewed' | 'unknown' | 'duplicate' | 'ignored';
  preferred_duplicate_group_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Alias {
  id: number;
  alias_text: string;
  normalized_alias: string;
  score_id: number;
  source: 'manual' | 'auto' | 'import';
  confidence: number;
  created_at: string;
  updated_at: string;
  score?: Score;
}

export interface Setlist {
  id: number;
  name: string;
  source_text: string | null;
  /** JSON array of instrument names this setlist has views for. */
  instruments: string | null;
  created_at: string;
  updated_at: string;
  items?: SetlistItem[];
}

export interface SetlistItem {
  id: number;
  setlist_id: number;
  position: number;
  requested_title: string;
  matched_score_id: number | null;
  match_status: 'matched' | 'needs_review' | 'missing' | 'placeholder';
  confidence: number;
  match_reason: string | null;
  approved: boolean;
  created_at: string;
  updated_at: string;
  matched_score?: Score | null;
}

export interface MatchResult {
  score: Score;
  confidence: number;
  reason: string;
}

export interface ScannedFile {
  original_filename: string;
  original_relative_path: string;
  original_absolute_path: string;
  file_size: number;
  modified_at: string;
}
