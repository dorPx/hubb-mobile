import type { AgentEndpoint, HubMessage } from "./store";

export interface ChatResult {
  text: string;
  error?: string;
}

/** An agent is "live" only when all three endpoint fields are set. */
export function isEndpointLive(e: AgentEndpoint | undefined): boolean {
  return !!(e && e.baseUrl.trim() && e.apiKey.trim() && e.model.trim());
}

function jsonCompletion(raw: string, onToken?: (t: string) => void): ChatResult {
  try {
    const j = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content ?? "";
    if (text) onToken?.(text);
    return { text };
  } catch {
    return { text: "", error: "Unrecognized response from endpoint." };
  }
}

function parseSseDeltas(chunk: string, onToken?: (t: string) => void): string {
  let out = "";
  for (const line of chunk.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const payload = t.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const j = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
      const delta = j.choices?.[0]?.delta?.content ?? "";
      if (delta) {
        out += delta;
        onToken?.(delta);
      }
    } catch {
      /* keep-alive or partial frame — ignore */
    }
  }
  return out;
}

/**
 * Call any OpenAI-compatible /chat/completions endpoint. Streams token deltas
 * to `onToken` when the platform's fetch exposes a readable body (web); on
 * native it buffers the streamed response and parses it in one pass. Falls back
 * to the non-streaming JSON shape if the server ignored `stream`.
 */
export async function runChat(
  endpoint: AgentEndpoint,
  history: HubMessage[],
  system: string,
  onToken?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<ChatResult> {
  const url = `${endpoint.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const messages = [
    { role: "system", content: system },
    ...history.map((m) => ({ role: m.role, content: m.text })),
  ];
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
      body: JSON.stringify({ model: endpoint.model, messages, stream: true }),
      signal,
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        detail = body.error?.message ?? detail;
      } catch {
        /* non-JSON error body */
      }
      return { text: "", error: detail };
    }

    // Web: incremental reader. Native RN global fetch lacks getReader → text path.
    const body = res.body as (ReadableStream<Uint8Array> & { getReader?: () => ReadableStreamDefaultReader<Uint8Array> }) | null;
    if (onToken && body?.getReader) {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let full = "";
      let rawAll = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const piece = decoder.decode(value, { stream: true });
        rawAll += piece;
        buf += piece;
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) full += parseSseDeltas(frame, onToken);
      }
      if (buf) full += parseSseDeltas(buf, onToken);
      if (full) return { text: full };
      // The reader already drained the body; parse the captured text instead of
      // calling res.text() again (which would throw "body already read").
      return jsonCompletion(rawAll, onToken);
    }

    const raw = await res.text();
    // Streamed SSE buffered whole (native), or a plain JSON completion.
    if (raw.includes("data:")) {
      const full = parseSseDeltas(raw, onToken);
      if (full) return { text: full };
    }
    return jsonCompletion(raw, onToken);
  } catch (e) {
    const err = e as Error;
    if (err.name === "AbortError") return { text: "", error: "aborted" };
    return { text: "", error: err.message || String(e) };
  }
}
