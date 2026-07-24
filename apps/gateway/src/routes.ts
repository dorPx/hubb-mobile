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
import * as ssh from "./ssh.js";
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

// ------------------------------------------------------------- milestone 2

router.get("/search", requireAuth, async (req, res, next) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json([]);
  try {
    res.json(await upstream.searchSessions(q));
  } catch (e) {
    next(e);
  }
});

router.get("/workspaces", requireAuth, async (_req, res, next) => {
  try {
    res.json(await upstream.listWorkspaces());
  } catch (e) {
    next(e);
  }
});

router.get("/files", requireAuth, async (req, res, next) => {
  const path = String(req.query.path ?? "");
  if (!path) return res.status(400).json({ error: "path required" });
  try {
    res.json(await upstream.listDir(path));
  } catch (e) {
    next(e);
  }
});

router.get("/file", requireAuth, async (req, res, next) => {
  const path = String(req.query.path ?? "");
  if (!path) return res.status(400).json({ error: "path required" });
  try {
    res.json(await upstream.readFile(path));
  } catch (e) {
    next(e);
  }
});

router.get("/tasks", requireAuth, async (_req, res, next) => {
  try {
    res.json(await upstream.listCrons());
  } catch (e) {
    next(e);
  }
});

router.post("/tasks/:id/:action", requireAuth, async (req, res, next) => {
  const action = req.params.action;
  if (action !== "pause" && action !== "resume" && action !== "run") {
    return res.status(400).json({ error: "action must be pause|resume|run" });
  }
  try {
    await upstream.cronAction(req.params.id, action);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get("/tasks/:id/history", requireAuth, async (req, res, next) => {
  try {
    res.json(await upstream.cronHistory(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.get("/skills", requireAuth, async (_req, res, next) => {
  try {
    res.json(await upstream.listSkills());
  } catch (e) {
    next(e);
  }
});

router.post("/skills/:name/toggle", requireAuth, async (req, res, next) => {
  const disabled = !!req.body?.disabled;
  try {
    await upstream.toggleSkill(req.params.name, disabled);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get("/sessions/:id/usage", requireAuth, async (req, res, next) => {
  try {
    res.json(await upstream.sessionUsage(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.get("/insights", requireAuth, async (_req, res, next) => {
  try {
    const [health, skills, sessions] = await Promise.allSettled([
      upstream.systemHealth(),
      upstream.skillsUsage(),
      upstream.listSessions(),
    ]);
    res.json({
      upstreamReachable: await upstream.upstreamReachable(),
      activeStreams: upstream.activeStreamCount(),
      health: health.status === "fulfilled" ? health.value : null,
      skillsUsage: skills.status === "fulfilled" ? skills.value : [],
      sessionCount: sessions.status === "fulfilled" ? sessions.value.length : null,
    });
  } catch (e) {
    next(e);
  }
});

// ------------------------------------------------------------- milestone 3

router.get("/soul", requireAuth, async (_req, res, next) => {
  try {
    res.json(await upstream.getSoul());
  } catch (e) {
    next(e);
  }
});

router.put("/soul", requireAuth, async (req, res, next) => {
  const content = typeof req.body?.content === "string" ? req.body.content : null;
  if (content === null) return res.status(400).json({ error: "content required" });
  try {
    await upstream.saveSoul(content);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get("/providers", requireAuth, async (_req, res, next) => {
  try {
    res.json(await upstream.listProviders());
  } catch (e) {
    next(e);
  }
});

router.put("/providers/:id/key", requireAuth, async (req, res, next) => {
  const key = req.body?.apiKey;
  try {
    await upstream.setProviderKey(req.params.id, typeof key === "string" && key ? key : null);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/terminal/:sessionId/start", requireAuth, async (req, res, next) => {
  try {
    await upstream.terminalStart(
      req.params.sessionId,
      Number(req.body?.rows) || 24,
      Number(req.body?.cols) || 80,
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/terminal/:sessionId/input", requireAuth, async (req, res, next) => {
  const data = typeof req.body?.data === "string" ? req.body.data : "";
  try {
    await upstream.terminalInput(req.params.sessionId, data);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/terminal/:sessionId/close", requireAuth, async (req, res) => {
  await upstream.terminalClose(req.params.sessionId);
  res.json({ ok: true });
});

/** SSE pass-through of the host terminal's output. */
router.get("/terminal/:sessionId/output", requireAuth, async (req, res) => {
  const ctrl = new AbortController();
  req.on("close", () => ctrl.abort());
  try {
    const up_ = await upstream.terminalOutputStream(req.params.sessionId, ctrl.signal);
    if (!up_.ok || !up_.body) {
      return res.status(up_.status).json({ error: "terminal stream failed" });
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    for await (const chunk of up_.body) res.write(chunk);
  } catch {
    /* stream ended or client left */
  }
  res.end();
});

// ------------------------------------------------------------------- ssh
// The gateway opens a real SSH shell to an arbitrary host and bridges it to
// the phone. Credentials are used to connect and are not persisted.

router.post("/ssh/connect", requireAuth, async (req: AuthedRequest, res) => {
  const body = req.body ?? {};
  const host = typeof body.host === "string" ? body.host.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!host || !username || !password) {
    return res.status(400).json({ error: "host, username, and password are required", code: "ssh_input" });
  }
  try {
    const { id } = await ssh.openSsh(req.deviceId!, {
      host,
      port: Number(body.port) || 22,
      username,
      password,
      rows: Number(body.rows) || 24,
      cols: Number(body.cols) || 80,
    });
    res.json({ sshId: id });
  } catch (e) {
    res.status(502).json({ error: `ssh connect failed: ${(e as Error).message}`, code: "ssh_connect" });
  }
});

router.post("/ssh/:id/input", requireAuth, (req: AuthedRequest, res) => {
  const data = typeof req.body?.data === "string" ? req.body.data : "";
  if (!ssh.writeSsh(req.params.id, req.deviceId!, data)) {
    return res.status(404).json({ error: "no such ssh session", code: "ssh_missing" });
  }
  res.json({ ok: true });
});

router.post("/ssh/:id/close", requireAuth, (req: AuthedRequest, res) => {
  if (ssh.sshOwned(req.params.id, req.deviceId!)) ssh.closeSsh(req.params.id);
  res.json({ ok: true });
});

/** SSE stream of the SSH shell's output (replays retained buffer, then live). */
router.get("/ssh/:id/output", requireAuth, (req: AuthedRequest, res) => {
  if (!ssh.sshOwned(req.params.id, req.deviceId!)) {
    return res.status(404).json({ error: "no such ssh session", code: "ssh_missing" });
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  const unsub = ssh.subscribeSsh(
    req.params.id,
    req.deviceId!,
    (text) => res.write(`data: ${JSON.stringify({ data: text })}\n\n`),
    () => {
      res.write("event: close\ndata: {}\n\n");
      clearInterval(ping);
      res.end();
    },
  );
  req.on("close", () => {
    clearInterval(ping);
    unsub?.();
  });
});

// Keyless news proxy w/ cache — spares the phone CORS trouble and spares
// GDELT repeat hits (it rate-limits aggressively).
const newsCache = new Map<string, { at: number; items: unknown[] }>();
router.get("/news", requireAuth, async (req, res) => {
  const q = String(req.query.q ?? "world");
  const hit = newsCache.get(q);
  if (hit && Date.now() - hit.at < 10 * 60_000) return res.json(hit.items);
  try {
    const r = await fetch(
      "https://api.gdeltproject.org/api/v2/doc/doc?query=" +
        encodeURIComponent(`${q} sourcelang:english`) +
        "&mode=artlist&maxrecords=14&format=json&sort=datedesc",
      { signal: AbortSignal.timeout(12000) },
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = (await r.json()) as { articles?: { title: string; domain?: string; seendate?: string; url: string }[] };
    const items = (d.articles ?? []).map((a) => ({
      title: a.title,
      src: (a.domain ?? "").replace(/^www\./, ""),
      seendate: a.seendate ?? null,
      url: a.url,
    }));
    if (!items.length) throw new Error("empty wire");
    newsCache.set(q, { at: Date.now(), items });
    res.json(items);
  } catch (e) {
    if (hit) return res.json(hit.items); // stale beats nothing
    res.status(502).json({ error: "news wire unreachable: " + String((e as Error).message || e) });
  }
});

// FX reference rates proxy (frankfurter blocks browser CORS; native is fine
// either way). Cached for an hour — ECB updates once a day.
let fxCache: { at: number; body: unknown } | null = null;
router.get("/fx", requireAuth, async (_req, res) => {
  if (fxCache && Date.now() - fxCache.at < 60 * 60_000) return res.json(fxCache.body);
  try {
    const r = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,JPY,CHF,CAD", {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = await r.json();
    fxCache = { at: Date.now(), body };
    res.json(body);
  } catch (e) {
    if (fxCache) return res.json(fxCache.body);
    res.status(502).json({ error: "fx unavailable: " + String((e as Error).message || e) });
  }
});

// ------------------------------------------------------------- milestone 4

router.post("/files/create", requireAuth, async (req, res, next) => {
  const dir = String(req.body?.dir ?? "");
  const name = String(req.body?.name ?? "").trim();
  const content = typeof req.body?.content === "string" ? req.body.content : "";
  if (!dir || !name) return res.status(400).json({ error: "dir and name required" });
  if (name.includes("/") || name.includes("..")) return res.status(400).json({ error: "invalid file name" });
  try {
    res.status(201).json(await upstream.createFile(dir, name, content));
  } catch (e) {
    next(e);
  }
});

router.post("/tasks/create", requireAuth, async (req, res, next) => {
  const prompt = String(req.body?.prompt ?? "").trim();
  const schedule = String(req.body?.schedule ?? "").trim();
  if (!prompt || !schedule) return res.status(400).json({ error: "prompt and schedule required" });
  try {
    res.status(201).json(
      await upstream.createTask({
        name: String(req.body?.name ?? "").trim(),
        prompt,
        schedule,
        deliver: req.body?.deliver ? String(req.body.deliver) : undefined,
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.delete("/tasks/:id", requireAuth, async (req, res, next) => {
  try {
    await upstream.deleteTask(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
