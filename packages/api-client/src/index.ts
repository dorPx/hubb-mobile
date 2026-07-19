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

export class GatewayClient {
  private baseUrl: string;
  private fetchImpl: FetchLike;

  constructor(private opts: GatewayClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
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

  send(sessionId: string, req: ChatSendRequest): Promise<{ accepted: boolean }> {
    return this.request(
      `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
      z.object({ accepted: z.boolean() }),
      { method: "POST", body: JSON.stringify(req) },
    );
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
