import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  host_token_hash TEXT NOT NULL,
  host_participant_id TEXT NOT NULL,
  scale TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'diverse',
  collect_ms INTEGER NOT NULL,
  vote_ms INTEGER NOT NULL,
  phase TEXT NOT NULL,
  phase_ends_at INTEGER,
  max_participants INTEGER NOT NULL,
  show_authors INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  ready INTEGER NOT NULL DEFAULT 0,
  follows_majority INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS options (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ratings (
  option_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (option_id, participant_id)
);

CREATE INDEX IF NOT EXISTS participants_room ON participants(room_id);
CREATE INDEX IF NOT EXISTS options_room ON options(room_id);
`;

export function openDatabase(filename: string): DB {
  const db = new Database(filename);
  if (filename !== ":memory:") db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 3000");
  db.exec(SCHEMA);
  const columns = db.prepare("PRAGMA table_info(rooms)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "show_authors")) {
    db.exec("ALTER TABLE rooms ADD COLUMN show_authors INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.some((column) => column.name === "mode")) {
    db.exec("ALTER TABLE rooms ADD COLUMN mode TEXT NOT NULL DEFAULT 'diverse'");
    const after = db.prepare("PRAGMA table_info(rooms)").all() as { name: string }[];
    if (after.some((column) => column.name === "scale")) {
      db.exec("UPDATE rooms SET mode = 'close' WHERE scale = 'score10'");
    }
  }
  return db;
}

let singleton: DB | null = null;

export function getDb(): DB {
  if (!singleton) {
    const directory = path.join(process.cwd(), "data");
    fs.mkdirSync(directory, { recursive: true });
    singleton = openDatabase(path.join(directory, "nandch.db"));
  }
  return singleton;
}
