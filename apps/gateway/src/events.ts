import { EventEmitter } from "node:events";
import type { AgentEvent, AgentEventType } from "@hermes-mobile/shared";
import { db } from "./db.js";

// Per-session monotonic event log: the durable record that makes mobile
// resume possible. Live subscribers get post-persist fanout via EventEmitter.

const bus = new EventEmitter();
bus.setMaxListeners(200);

const nextSeqStmt = db.prepare(
  "SELECT COALESCE(MAX(seq), 0) AS max FROM events WHERE session_id = ?",
);
const insertStmt = db.prepare(
  "INSERT INTO events (session_id, seq, type, data, ts) VALUES (?, ?, ?, ?, ?)",
);

export function appendEvent(
  sessionId: string,
  type: AgentEventType,
  data: unknown,
): AgentEvent {
  const seq = ((nextSeqStmt.get(sessionId) as { max: number }).max ?? 0) + 1;
  const ev: AgentEvent = { seq, sessionId, type, data, ts: Date.now() };
  insertStmt.run(sessionId, seq, type, JSON.stringify(data ?? null), ev.ts);
  bus.emit(sessionId, ev);
  return ev;
}

export function eventsAfter(sessionId: string, afterSeq: number, limit = 2000): AgentEvent[] {
  const rows = db
    .prepare(
      "SELECT seq, type, data, ts FROM events WHERE session_id = ? AND seq > ? ORDER BY seq LIMIT ?",
    )
    .all(sessionId, afterSeq, limit) as { seq: number; type: string; data: string; ts: number }[];
  return rows.map((r) => ({
    seq: r.seq,
    sessionId,
    type: r.type as AgentEventType,
    data: JSON.parse(r.data),
    ts: r.ts,
  }));
}

export function lastSeq(sessionId: string): number {
  return (nextSeqStmt.get(sessionId) as { max: number }).max ?? 0;
}

export function subscribe(sessionId: string, fn: (ev: AgentEvent) => void): () => void {
  bus.on(sessionId, fn);
  return () => bus.off(sessionId, fn);
}
