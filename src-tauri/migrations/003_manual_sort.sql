-- `sort` becomes a manual order within a day (set by drag and drop). 0 = not reordered,
-- which falls back to due time and priority. Reset the old insertion counters.
UPDATE tasks SET sort = 0;
