-- When a due-time notification was shown for this task (NULL = not yet).
-- Cleared whenever the due time changes.
ALTER TABLE tasks ADD COLUMN notified_at TEXT;
