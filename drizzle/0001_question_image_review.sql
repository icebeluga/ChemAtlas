-- Review-only persistence. The canonical question catalog remains questions.json.
CREATE TABLE IF NOT EXISTS review_records (
  owner_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('question', 'stimulus')),
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('not_generated', 'pending_review', 'accepted', 'rejected', 'corrected_pending_review', 'missing_source')),
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS review_records_owner_status ON review_records(owner_id, status, entity_type);

CREATE TABLE IF NOT EXISTS review_history (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('question', 'stimulus')),
  entity_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  event_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS review_history_entity ON review_history(owner_id, entity_type, entity_id, revision);
CREATE UNIQUE INDEX IF NOT EXISTS review_history_revision_unique ON review_history(owner_id, entity_type, entity_id, revision);

CREATE TABLE IF NOT EXISTS crop_revisions (
  owner_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('question', 'stimulus')),
  entity_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  crop_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (owner_id, entity_type, entity_id, revision)
);

CREATE TABLE IF NOT EXISTS image_objects (
  owner_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('question', 'stimulus')),
  entity_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  segment INTEGER NOT NULL CHECK (segment > 0),
  object_key TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length > 0),
  sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, entity_type, entity_id, revision, segment),
  UNIQUE (object_key)
);

CREATE INDEX IF NOT EXISTS image_objects_entity ON image_objects(owner_id, entity_type, entity_id, revision);

CREATE TABLE IF NOT EXISTS stimulus_links (
  owner_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  stimulus_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, question_id, stimulus_id)
);
