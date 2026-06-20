export const ROOMS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  chapter_id TEXT NOT NULL,
  theory_answers TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(theory_answers)),
  practice_answers TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(practice_answers))
);
`;
