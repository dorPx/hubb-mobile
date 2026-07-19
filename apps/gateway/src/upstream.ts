
import type { ModelInfo, SessionSummary } from "@hermes-mobile/shared";
import { config } from "./config.js";
import { db } from "./db.js";
import { appendEvent, lastSeq } from "./events.js";

// Adapter over the hermes-webui HTTP API (which itself wraps the hermes CLI).
// Nothing upstream is forked; this file is the single place that knows the
// upstream wire format.

interface UpstreamSession {
  session_id: string;
  title?: string;
  workspace?: string | null;
  model?: string | null;
  model_provider?: string | null;
  message_count?: number;
  created_at?: number;
  updated_at?: number;
}

const activeStreams = new Map<string, AbortController>(); // sessionId -> live tail

export function activeStreamCount(): number {
  return activeStreams.size;
}

async function up<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(config.upstreamUrl + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: init?.signal ?? AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`upstream ${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function upstreamReachable(): Promise<boolean> {
  try {
    const res = await fetch(config.upstreamUrl + "/health", { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

function toSummary(s: UpstreamSession): SessionSummary {
  return {
    id: s.session_id,
    title: s.title || "Untitled",
    workspace: s.workspace ?? null,
    provider: s.model_provider ?? null,
    model: s.model ?? null,
    messageCount: s.message_count ?? 0,
    createdAt: Math.round((s.created_at ?? 0) * 1000),
    updatedAt: Math.round((s.updated_at ?? 0) * 1000),
    lastSeq: lastSeq(s.session_id),
    streaming: activeStreams.has(s.session_id),
  };
}

export async function listSessions(): Promise<SessionSummary[]> {
  const data = await up<{ sessions: UpstreamSession[] }>("/api/sessions");
  return (data.sessions || []).map(toSummary);
}

export async function getSession(id: string): Promise<SessionSummary> {
  const data = await up<UpstreamSession>(
    `/api/session?session_id=${encodeURIComponent(id)}&messages=0&resolve_model=0`,
  );
  return toSummary({ ...data, session_id: data.session_id || id });
}

export async function createSession(title?: string): Promise<SessionSummary> {
  const data = await up<{ session: UpstreamSession }>("/api/session/new", {
    method: "POST",
    body: JSON.stringify({ worktree: false }),
  });
  const s = toSummary(data.session);
  if (title) {
    try {
      await up("/api/session/rename", {
        method: "POST",
        body: JSON.stringify({ session_id: s.id, title }),
      });
      s.title = title;
    } catch {
      /* cosmetic; keep upstream default title */
    }
  }
  return s;
}

export async function listModels(): Promise<ModelInfo[]> {
  const data = await up<{
    groups?: { provider: string; provider_id: string; models: { id: string; label: string }[] }[];
  }>("/api/models");
  const out: ModelInfo[] = [];
  for (const g of data.groups ?? []) {
    for (const m of g.models ?? []) {
      out.push({ id: m.id, provider: g.provider_id, label: `${m.label} (${g.provider})`, available: true });
    }
  }
  return out;
}

/**
 * Start an agent turn upstream and tail its SSE stream into the event log.
 * Returns once the turn is accepted; the tail continues in the background so
 * the phone can disconnect/reconnect freely (or be dead) without losing events.
 */
export async function startTurn(sessionId: string, message: string, model?: string): Promise<void> {
  const meta = db
    .prepare("SELECT model, provider FROM session_meta WHERE session_id = ?")
    .get(sessionId) as { model: string | null; provider: string | null } | undefined;

  const body: Record<string, unknown> = { session_id: sessionId, message, profile: "default" };
  const chosenModel = model ?? meta?.model ?? undefined;
  if (chosenModel) {
    body.model = chosenModel;
    // upstream model ids may carry "@provider:" prefixes; split them out
    const m = /^@([^:]+):(.+)$/.exec(chosenModel);
    if (m) {
      body.model_provider = m[1];
      body.model = m[2];
    } else if (meta?.provider) {
      body.model_provider = meta.provider;
    }
  }

  appendEvent(sessionId, "status", { phase: "user_message", message });
  const start = await up<{ stream_id?: string; error?: string }>("/api/chat/start", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!start.stream_id) throw new Error(start.error || "upstream did not return stream_id");
  void tailStream(sessionId, start.stream_id);
}

async function tailStream(sessionId: string, streamId: string): Promise<void> {
  const ctrl = new AbortController();
  activeStreams.set(sessionId, ctrl);
  try {
    const res = await fetch(
      `${config.upstreamUrl}/api/chat/stream?stream_id=${encodeURIComponent(streamId)}`,
      { headers: { Accept: "text/event-stream" }, signal: ctrl.signal },
    );
    if (!res.ok || !res.body) throw new Error(`stream HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let sawTerminal = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop() ?? "";
      for (const frame of frames) {
        let eventType = "message";
        let dataRaw = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) eventType = line.slice(6).trim();
          else if (line.startsWith("data:")) dataRaw += line.slice(5).trim();
        }
        if (!dataRaw) continue;
        let data: unknown = dataRaw;
        try {
          data = JSON.parse(dataRaw);
        } catch {
          /* keep raw string */
        }
        // upstream aliases → our canonical event types
        if (eventType === "reasoning") eventType = "thinking";
        const known = [
          "token",
          "thinking",
          "tool_calls",
          "status",
          "usage",
          "approval",
          "clarify",
          "metadata",
          "done",
          "error",
        ] as const;
        const type = (known as readonly string[]).includes(eventType)
          ? (eventType as (typeof known)[number])
          : "status";
        appendEvent(sessionId, type, type === "status" && eventType !== "status" ? { upstreamEvent: eventType, data } : data);
        if (eventType === "done" || eventType === "error") sawTerminal = true;
      }
    }
    if (!sawTerminal) appendEvent(sessionId, "done", { reason: "stream_closed" });
  } catch (e) {
    if ((e as Error).name !== "AbortError") {
      appendEvent(sessionId, "error", { error: String((e as Error).message || e) });
    }
  } finally {
    activeStreams.delete(sessionId);
  }
}
