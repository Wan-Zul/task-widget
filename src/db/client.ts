import Database from "@tauri-apps/plugin-sql";

// Must match DB_URL in src-tauri/src/lib.rs so the registered migrations run.
const DB_URL = "sqlite:tasks.db";

let dbPromise: Promise<Database> | null = null;

export function db(): Promise<Database> {
  if (!dbPromise) dbPromise = Database.load(DB_URL);
  return dbPromise;
}
