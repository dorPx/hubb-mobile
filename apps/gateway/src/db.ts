import Database from "better-sqlite3";
import path from "node:path";
import { config } from "./config.js";

export const db = new Database(path.join(config.dataDir, "gateway.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS events (
  session_id TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  type       TEXT NOT NULL,
  data       TEXT NOT NULL,
  ts         INTEGER NOT NULL,
  PRIMARY KEY (session_id, seq)
);
CREATE TABLE IF NOT EXISTS devices (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  platform    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0,
  push_token  TEXT
);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash  TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL REFERENCES devices(id),
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  rotated_from TEXT
);
CREATE TABLE IF NOT EXISTS pairing_tokens (
  token_hash  TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS session_meta (
  session_id  TEXT PRIMARY KEY,
  model       TEXT,
  provider    TEXT,
  created_at  INTEGER NOT NULL
);
`);
