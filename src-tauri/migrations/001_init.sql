CREATE TABLE categories (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT NOT NULL DEFAULT '#8a8f98',
  sort  INTEGER NOT NULL DEFAULT 0
);

-- Series template for recurring tasks. Each active series has exactly one open instance in `tasks`.
CREATE TABLE recurrence_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  notes       TEXT,
  priority    INTEGER NOT NULL DEFAULT 1,           -- 0 low, 1 med, 2 high
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  rrule       TEXT NOT NULL,                        -- RFC 5545 RRULE, no DTSTART line
  dtstart     TEXT NOT NULL,                        -- floating local time 'YYYY-MM-DDTHH:MM'
  has_time    INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))
);

CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  notes       TEXT,
  due_at      TEXT,                                 -- floating local time 'YYYY-MM-DDTHH:MM'
  has_time    INTEGER NOT NULL DEFAULT 0,           -- 0 = date only (time part is 00:00)
  priority    INTEGER NOT NULL DEFAULT 1,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  done        INTEGER NOT NULL DEFAULT 0,
  done_at     TEXT,
  series_id   INTEGER REFERENCES recurrence_rules(id) ON DELETE SET NULL,
  sort        REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))
);
CREATE INDEX idx_tasks_done_due ON tasks(done, due_at);
CREATE INDEX idx_tasks_series ON tasks(series_id);

CREATE TABLE completions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id      INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  series_id    INTEGER REFERENCES recurrence_rules(id) ON DELETE CASCADE,
  due_at       TEXT,
  completed_at TEXT NOT NULL
);
CREATE INDEX idx_completions_series ON completions(series_id);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                               -- JSON-encoded
);

INSERT INTO categories (name, color, sort) VALUES
  ('FYP',       '#4f7cff', 0),
  ('Freelance', '#20a67a', 1),
  ('ARC',       '#d9822b', 2),
  ('Personal',  '#a35bd6', 3);
