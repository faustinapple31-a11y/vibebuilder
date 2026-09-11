CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  thumbnail TEXT,
  style_preset TEXT NOT NULL DEFAULT 'stylized_mystical',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_build_at TEXT,
  last_build_status TEXT,
  last_publish_at TEXT,
  roblox_universe_id INTEGER,
  roblox_place_id INTEGER,
  settings TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS world_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  world_id TEXT NOT NULL DEFAULT 'main',
  version TEXT NOT NULL,
  parent_version_id TEXT,
  label TEXT,
  spec TEXT NOT NULL,
  style TEXT,
  stats TEXT,
  score INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_world_versions_project ON world_versions(project_id, created_at);

CREATE TABLE IF NOT EXISTS prompt_history (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  provider TEXT NOT NULL,
  prompt TEXT NOT NULL,
  response_summary TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prompt_history_project ON prompt_history(project_id, created_at);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  role TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL,
  prompt TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  usage TEXT,
  log_path TEXT,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS build_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  report TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL DEFAULT '',
  style TEXT NOT NULL DEFAULT 'stylized_low_poly',
  biome TEXT NOT NULL DEFAULT 'any',
  rarity TEXT NOT NULL DEFAULT 'common',
  bbox TEXT NOT NULL DEFAULT '[4,4,4]',
  scale TEXT NOT NULL DEFAULT '[1,1]',
  rotation TEXT NOT NULL DEFAULT 'y-only',
  materials TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'procedural',
  license TEXT NOT NULL DEFAULT 'CC0',
  thumbnail TEXT,
  file_path TEXT,
  roblox_asset_id INTEGER,
  favorite INTEGER NOT NULL DEFAULT 0,
  collections TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
