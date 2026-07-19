import { Router, type Response } from "express";
import {
  chatSendRequestSchema,
  pairRequestSchema,
  refreshRequestSchema,
} from "@hermes-mobile/shared";
import {
  consumePairingToken,
  registerDevice,
  requireAuth,
  rotateRefresh,
  revokeDevice,
  type AuthedRequest,
} from "./auth.js";
import { config } from "./config.js";
import { db } from "./db.js";
import { eventsAfter, subscribe } from "./events.js";
import * as upstream from "./upstream.js";

export const router = Router();

// ------------------------------------------------------------------ auth

router.post("/auth/pair", async (req, res) => {
  const parsed = pairRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid pair request" });
  if (!consumePairingToken(parsed.data.pairingToken)) {
    return res.status(401).json({ error: "pairing token invalid or expired", code: "bad_pairing" });
  }
  res.json(await registerDevice(parsed.data.deviceName, parsed.data.platform));
});

router.post("/auth/refresh", async (req, res) => {
  const parsed = refreshRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid refresh request" });
  const pair = await rotateRefresh(parsed.data.refreshToken);
  if (!pair) return res.status(401).json({ error: "refresh token invalid", code: "bad_refresh" });
  res.json(pair);
});

router.get("/devices", requireAuth, (_req, res) => {
  const rows = db
    .prepare("SELECT id, name, platform, created_at, last_seen_at, revoked FROM devices")
    .all() as { id: string; name: string; platform: string; created_at: number; last_seen_at: number; revoked: number }[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      platform: r.platform,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      revoked: !!r.revoked,
    })),
  );
});

router.post("/devices/:id/revoke", requireAuth, (req, res) => {
  revokeDevice(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- health

router.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    version: config.version,
    upstream: {
      reachable: await upstream.upstreamReachable(),
      activeStreams: upstream.activeStreamCount(),
    },
  });
});

// -------------------------------------------------------------- sessions

router.get("/sessions", requireAuth, async (_req, res, next) => {
  try {
    res.json(await upstream.listSessions());
  } catch (e) {
    next(e);
  }
});

router.post("/sessions", requireAuth, async (req, res, next) => {
  try {
    const title = typeof req.body?.title === "string" && req.body.title ? req.body.title : undefined;
    const session = await upstream.createSession(title);
    db.prepare(
      "INSERT OR IGNORE INTO session_meta (session_id, model, provider, created_at) VALUES (?, NULL, NULL, ?)",
    ).run(session.id, Date.now());
    res.status(201).json(session);
  } catch (e) {
    next(e);
  }
});

router.get("/sessions/:id", requireAuth, async (req, res, next) => {
  try {
    res.json(await upstream.getSession(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.get("/sessions/:id/transcript", requireAuth, async (req, res, next) => {
  try {
    res.json(await upstream.getTranscript(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.get("/models", requireAuth, async (_req, res, next) => {
  try {
    res.json(await upstream.listModels());
  } catch (e) {
    next(e);
  }
});

router.put("/sessions/:id/model", requireAuth, (req, res) => {
  const model = typeof req.body?.model === "string" ? req.body.model : null;
  if (!model) return res.status(400).json({ error: "model required" });
  db.prepare(
    `INSERT INTO session_meta (session_id, model, provider, created_at) VALUES (?, ?, NULL, ?)
     ON CONFLICT(session_id) DO UPDATE SET model = excluded.model`,
  ).run(req.params.id, model, Date.now());
  res.json({ ok: true });
});

router.post("/sessions/:id/messages", requireAuth, async (req, res) => {
  const parsed = chatSendRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "message required" });
  try {
    await upstream.startTurn(req.params.id, parsed.data.message, parsed.data.model);
    res.status(202).json({ accepted: true });
  } catch (e) {
    res.status(502).json({ error: String((e as Error).message || e), code: "upstream_failed" });
  }
});

// ---------------------------------------------------------------- events

router.get("/sessions/:id/events", requireAuth, (req, res) => {
  const after = Number(req.query.after ?? 0);
  res.json(eventsAfter(req.params.id, Number.isFinite(after) ? after : 0));
});

/** SSE: replay events after Last-Event-ID (or ?after=), then stream live. */
router.get("/sessions/:id/stream", requireAuth, (req: AuthedRequest, res: Response) => {
  const sessionId = req.params.id as string;
  const headerSeq = Number(req.headers["last-event-id"] ?? NaN);
  const querySeq = Number(req.query.after ?? NaN);
  const after = Number.isFinite(headerSeq) ? headerSeq : Number.isFinite(querySeq) ? querySeq : 0;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const write = (ev: { seq: number }) => {
    res.write(`id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`);
  };

  // Replay from the durable log first — this is what makes process death on
  // the phone a non-event. Subscribe BEFORE replaying and buffer, so nothing
  // falls between replay and live.
  const buffered: { seq: number }[] = [];
  let replaying = true;
  const unsub = subscribe(sessionId, (ev) => {
    if (replaying) buffered.push(ev);
    else write(ev);
  });

  let maxWritten = after;
  for (const ev of eventsAfter(sessionId, after)) {
    write(ev);
    maxWritten = ev.seq;
  }
  for (const ev of buffered) if (ev.seq > maxWritten) write(ev);
  replaying = false;

  const keepalive = setInterval(() => res.write(": keepalive\n\n"), 25000);
  req.on("close", () => {
    clearInterval(keepalive);
    unsub();
  });
});
