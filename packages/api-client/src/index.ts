import {
  agentEventSchema,
  apiErrorSchema,
  gatewayHealthSchema,
  sessionSummarySchema,
  tokenPairSchema,
  type AgentEvent,
  type ChatSendRequest,
  type GatewayHealth,
  type ModelInfo,
  type PairRequest,
  type SessionSummary,
  type TokenPair,
} from "@hermes-mobile/shared";
import { z } from "zod";

/** fetch implementation with streaming response bodies (native fetch on
 * Node/web; pass `fetch` from `expo/fetch` on React Native). */
export type FetchLike = typeof globalThis.fetch;

export interface GatewayClientOptions {
  baseUrl: string;
  fetchImpl?: FetchLike;
  getAccessToken?: () => Promise<string | null> | string | null;
  /** Called on 401 after a failed request; return a fresh token to retry once. */
  onAuthExpired?: () => Promise<string | null>;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export interface EventStreamHandle {
  close: () => void;
  done: Promise<void>;
}

const dirEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["dir", "file"]),
  size: z.number().nullable(),
});
export type DirEntry = z.infer<typeof dirEntrySchema>;

const cronJobSchema = z.object({
  id: z.string(),
  name: z.string(),
  prompt: z.string(),
  schedule: z.string(),
  paused: z.boolean(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  lastRunAt: z.number().nullable(),
  lastStatus: z.string().nullable(),
});
export type CronJob = z.infer<typeof cronJobSchema>;

const skillInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
  category: z.string().nullable(),
  disabled: z.boolean(),
});
export type SkillInfo = z.infer<typeof skillInfoSchema>;

const insightsSchema = z.object({
  upstreamReachable: z.boolean(),
  activeStreams: z.number(),
  health: z.record(z.string(), z.unknown()).nullable(),
  skillsUsage: z.array(z.object({ name: z.string(), uses: z.number() })),
  sessionCount: z.number().nullable(),
});
export type Insights = z.infer<typeof insightsSchema>;

const providerInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  hasKey: z.boolean(),
  configurable: z.boolean(),
  keySource: z.string().nullable(),
  authError: z.string().nullable(),
  modelCount: z.number(),
});
export type ProviderInfo = z.infer<typeof providerInfoSchema>;

const sessionUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
  estimatedCost: z.number(),
  model: z.string().nullable(),
});
export type SessionUsage = z.infer<typeof sessionUsageSchema>;

export interface TranscriptMessage {
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  ts: number;
}

export class GatewayClient {
  private baseUrl: string;
  private fetchImpl: FetchLike;

  constructor(private opts: GatewayClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    // bind: an unbound window.fetch throws "Illegal invocation" on web
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  // ----------------------------------------------------------------- core

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
    retried = false,
  ): Promise<T> {
    const token = await this.opts.getAccessToken?.();
    const res = await this.fetchImpl(this.baseUrl + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (res.status === 401 && !retried && this.opts.onAuthExpired) {
      const fresh = await this.opts.onAuthExpired();
      if (fresh) return this.request(path, schema, init, true);
    }
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      let code: string | undefined;
      try {
        const body = apiErrorSchema.parse(await res.json());
        message = body.error;
        code = body.code;
      } catch {
        /* non-JSON error body */
      }
      throw new GatewayError(message, res.status, code);
    }
    return schema.parse(await res.json());
  }

  // ----------------------------------------------------------------- auth

  pair(req: PairRequest): Promise<TokenPair> {
    return this.request("/v1/auth/pair", tokenPairSchema, {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  refresh(refreshToken: string): Promise<TokenPair> {
    return this.request("/v1/auth/refresh", tokenPairSchema, {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  }

  // ------------------------------------------------------------- sessions

  health(): Promise<GatewayHealth> {
    return this.request("/v1/health", gatewayHealthSchema);
  }

  listSessions(): Promise<SessionSummary[]> {
    return this.request("/v1/sessions", z.array(sessionSummarySchema));
  }

  createSession(title?: string): Promise<SessionSummary> {
    return this.request("/v1/sessions", sessionSummarySchema, {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  }

  getSession(id: string): Promise<SessionSummary> {
    return this.request(`/v1/sessions/${encodeURIComponent(id)}`, sessionSummarySchema);
  }

  listModels(): Promise<ModelInfo[]> {
    return this.request(
      "/v1/models",
      z.array(
        z.object({
          id: z.string(),
          provider: z.string(),
          label: z.string(),
          available: z.boolean(),
        }),
      ),
    );
  }

  transcript(sessionId: string): Promise<TranscriptMessage[]> {
    return this.request(
      `/v1/sessions/${encodeURIComponent(sessionId)}/transcript`,
      z.array(
        z.object({
          role: z.enum(["user", "assistant"]),
          text: z.string(),
          thinking: z.string().optional(),
          ts: z.number(),
        }),
      ),
    );
  }

  setSessionModel(sessionId: string, model: string): Promise<{ ok: boolean }> {
    return this.request(
      `/v1/sessions/${encodeURIComponent(sessionId)}/model`,
      z.object({ ok: z.boolean() }),
      { method: "PUT", body: JSON.stringify({ model }) },
    );
  }

  send(sessionId: string, req: ChatSendRequest): Promise<{ accepted: boolean }> {
    return this.request(
      `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
      z.object({ accepted: z.boolean() }),
      { method: "POST", body: JSON.stringify(req) },
    );
  }

  // ---------------------------------------------------------- milestone 2

  searchSessions(q: string): Promise<SessionSummary[]> {
    return this.request(`/v1/search?q=${encodeURIComponent(q)}`, z.array(sessionSummarySchema));
  }

  workspaces(): Promise<{ path: string; name: string }[]> {
    return this.request("/v1/workspaces", z.array(z.object({ path: z.string(), name: z.string() })));
  }

  listDir(path: string): Promise<DirEntry[]> {
    return this.request(`/v1/files?path=${encodeURIComponent(path)}`, z.array(dirEntrySchema));
  }

  readFile(path: string): Promise<{ path: string; content: string; truncated: boolean }> {
    return this.request(
      `/v1/file?path=${encodeURIComponent(path)}`,
      z.object({ path: z.string(), content: z.string(), truncated: z.boolean() }),
    );
  }

  tasks(): Promise<CronJob[]> {
    return this.request("/v1/tasks", z.array(cronJobSchema));
  }

  taskAction(id: string, action: "pause" | "resume" | "run"): Promise<{ ok: boolean }> {
    return this.request(
      `/v1/tasks/${encodeURIComponent(id)}/${action}`,
      z.object({ ok: z.boolean() }),
      { method: "POST", body: "{}" },
    );
  }

  createTask(input: { name: string; prompt: string; schedule: string; deliver?: string }): Promise<CronJob> {
    return this.request("/v1/tasks/create", cronJobSchema, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  deleteTask(id: string): Promise<{ ok: boolean }> {
    return this.request(`/v1/tasks/${encodeURIComponent(id)}`, z.object({ ok: z.boolean() }), {
      method: "DELETE",
    });
  }

  createFile(dir: string, name: string, content: string): Promise<{ path: string }> {
    return this.request("/v1/files/create", z.object({ path: z.string() }), {
      method: "POST",
      body: JSON.stringify({ dir, name, content }),
    });
  }

  skills(): Promise<SkillInfo[]> {
    return this.request("/v1/skills", z.array(skillInfoSchema));
  }

  toggleSkill(name: string, disabled: boolean): Promise<{ ok: boolean }> {
    return this.request(
      `/v1/skills/${encodeURIComponent(name)}/toggle`,
      z.object({ ok: z.boolean() }),
      { method: "POST", body: JSON.stringify({ disabled }) },
    );
  }

  sessionUsage(id: string): Promise<SessionUsage> {
    return this.request(`/v1/sessions/${encodeURIComponent(id)}/usage`, sessionUsageSchema);
  }

  insights(): Promise<Insights> {
    return this.request("/v1/insights", insightsSchema);
  }

  // ---------------------------------------------------------- milestone 3

  getSoul(): Promise<{ soul: string; path: string }> {
    return this.request("/v1/soul", z.object({ soul: z.string(), path: z.string() }));
  }

  saveSoul(content: string): Promise<{ ok: boolean }> {
    return this.request("/v1/soul", z.object({ ok: z.boolean() }), {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
  }

  providers(): Promise<ProviderInfo[]> {
    return this.request("/v1/providers", z.array(providerInfoSchema));
  }

  setProviderKey(id: string, apiKey: string | null): Promise<{ ok: boolean }> {
    return this.request(
      `/v1/providers/${encodeURIComponent(id)}/key`,
      z.object({ ok: z.boolean() }),
      { method: "PUT", body: JSON.stringify({ apiKey }) },
    );
  }

  terminalStart(sessionId: string, rows: number, cols: number): Promise<{ ok: boolean }> {
    return this.request(
      `/v1/terminal/${encodeURIComponent(sessionId)}/start`,
      z.object({ ok: z.boolean() }),
      { method: "POST", body: JSON.stringify({ rows, cols }) },
    );
  }

  terminalInput(sessionId: string, data: string): Promise<{ ok: boolean }> {
    return this.request(
      `/v1/terminal/${encodeURIComponent(sessionId)}/input`,
      z.object({ ok: z.boolean() }),
      { method: "POST", body: JSON.stringify({ data }) },
    );
  }

  terminalClose(sessionId: string): Promise<{ ok: boolean }> {
    return this.request(
      `/v1/terminal/${encodeURIComponent(sessionId)}/close`,
      z.object({ ok: z.boolean() }),
      { method: "POST", body: "{}" },
    );
  }

  // ------------------------------------------------------------------- ssh

  sshConnect(input: {
    host: string;
    port?: number;
    username: string;
    password: string;
    rows?: number;
    cols?: number;
  }): Promise<{ sshId: string }> {
    return this.request("/v1/ssh/connect", z.object({ sshId: z.string() }), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  sshInput(sshId: string, data: string): Promise<{ ok: boolean }> {
    return this.request(
      `/v1/ssh/${encodeURIComponent(sshId)}/input`,
      z.object({ ok: z.boolean() }),
      { method: "POST", body: JSON.stringify({ data }) },
    );
  }

  sshClose(sshId: string): Promise<{ ok: boolean }> {
    return this.request(
      `/v1/ssh/${encodeURIComponent(sshId)}/close`,
      z.object({ ok: z.boolean() }),
      { method: "POST", body: "{}" },
    );
  }

  /** Stream SSH shell output (SSE `data:` chunks). `onClose` fires when the
   * remote shell ends. */
  streamSsh(
    sshId: string,
    onData: (text: string) => void,
    onClose?: () => void,
    onError?: (err: Error) => void,
  ): EventStreamHandle {
    const ctrl = new AbortController();
    const done = (async () => {
      const token = await this.opts.getAccessToken?.();
      const res = await this.fetchImpl(`${this.baseUrl}/v1/ssh/${encodeURIComponent(sshId)}/output`, {
        headers: {
          Accept: "text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new GatewayError(`ssh stream: HTTP ${res.status}`, res.status);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done: eof, value } = await reader.read();
        if (eof) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          if (frame.startsWith(":")) continue; // keep-alive ping
          if (frame.includes("event: close")) {
            onClose?.();
            continue;
          }
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            try {
              const j = JSON.parse(line.slice(5).trim()) as { data?: string };
              if (typeof j.data === "string") onData(j.data);
            } catch {
              /* non-JSON frame */
            }
          }
        }
      }
    })().catch((e: Error) => {
      if (e.name !== "AbortError") onError?.(e);
    });
    return { close: () => ctrl.abort(), done };
  }

  /** Stream raw terminal output text chunks (SSE `data:` payloads). */
  streamTerminal(
    sessionId: string,
    onData: (text: string) => void,
    onError?: (err: Error) => void,
  ): EventStreamHandle {
    const ctrl = new AbortController();
    const done = (async () => {
      const token = await this.opts.getAccessToken?.();
      const res = await this.fetchImpl(
        `${this.baseUrl}/v1/terminal/${encodeURIComponent(sessionId)}/output`,
        {
          headers: {
            Accept: "text/event-stream",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: ctrl.signal,
        },
      );
      if (!res.ok || !res.body) throw new GatewayError(`terminal stream: HTTP ${res.status}`, res.status);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done: eof, value } = await reader.read();
        if (eof) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            try {
              const j = JSON.parse(line.slice(5).trim()) as { data?: string };
              if (typeof j.data === "string") onData(j.data);
            } catch {
              onData(line.slice(5));
            }
          }
        }
      }
    })().catch((e: Error) => {
      if (e.name !== "AbortError") onError?.(e);
    });
    return { close: () => ctrl.abort(), done };
  }

  /** Replay persisted events after `afterSeq` (catch-up without a live stream). */
  eventsAfter(sessionId: string, afterSeq: number): Promise<AgentEvent[]> {
    return this.request(
      `/v1/sessions/${encodeURIComponent(sessionId)}/events?after=${afterSeq}`,
      z.array(agentEventSchema),
    );
  }

  // ------------------------------------------------------------ streaming

  /**
   * Live SSE stream with server-side replay: events with seq > afterSeq are
   * replayed first, then live events follow. Reconnection is the caller's
   * concern (pass the last seen seq back in).
   */
  streamEvents(
    sessionId: string,
    afterSeq: number,
    onEvent: (ev: AgentEvent) => void,
    onError?: (err: Error) => void,
  ): EventStreamHandle {
    const ctrl = new AbortController();
    const done = (async () => {
      const token = await this.opts.getAccessToken?.();
      const res = await this.fetchImpl(
        `${this.baseUrl}/v1/sessions/${encodeURIComponent(sessionId)}/stream`,
        {
          headers: {
            Accept: "text/event-stream",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "Last-Event-ID": String(afterSeq),
          },
          signal: ctrl.signal,
        },
      );
      if (!res.ok || !res.body) {
        throw new GatewayError(`stream failed: HTTP ${res.status}`, res.status);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done: eof, value } = await reader.read();
        if (eof) break;
        buf += decoder.decode(value, { stream: true });
        // SSE frames are separated by a blank line
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          const dataLine = frame
            .split("\n")
            .find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          try {
            const parsed = agentEventSchema.parse(JSON.parse(dataLine.slice(5).trim()));
            onEvent(parsed);
          } catch (e) {
            onError?.(e as Error);
          }
        }
      }
    })().catch((e: Error) => {
      if (e.name !== "AbortError") onError?.(e);
    });
    return { close: () => ctrl.abort(), done };
  }
}
