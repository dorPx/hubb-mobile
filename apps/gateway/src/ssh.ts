import { EventEmitter } from "node:events";
import { nanoid } from "nanoid";
import { Client, type ClientChannel } from "ssh2";

// ---------------------------------------------------------------------------
// SSH relay: the gateway opens a real SSH shell to an arbitrary host on the
// device's behalf and bridges it to the mobile terminal over SSE. Each session
// is owned by the device that created it — no cross-device access.
// ---------------------------------------------------------------------------

interface SshSession {
  id: string;
  deviceId: string;
  client: Client;
  stream: ClientChannel | null;
  emitter: EventEmitter;
  buffer: string[]; // recent output chunks retained for reconnect replay
  closed: boolean;
  host: string;
  username: string;
}

const sessions = new Map<string, SshSession>();
const MAX_BUFFER = 400;

export interface SshConnectInput {
  host: string;
  port?: number;
  username: string;
  password: string;
  rows?: number;
  cols?: number;
}

export function openSsh(deviceId: string, input: SshConnectInput): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const id = nanoid(16);
    const emitter = new EventEmitter();
    const session: SshSession = {
      id,
      deviceId,
      client,
      stream: null,
      emitter,
      buffer: [],
      closed: false,
      host: input.host,
      username: input.username,
    };

    client
      .on("ready", () => {
        client.shell(
          { rows: input.rows ?? 24, cols: input.cols ?? 80, term: "xterm-256color" },
          (err: Error | undefined, stream: ClientChannel) => {
            if (err) {
              client.end();
              return reject(err);
            }
            session.stream = stream;
            sessions.set(id, session);
            const push = (chunk: Buffer) => {
              const text = chunk.toString("utf8");
              session.buffer.push(text);
              if (session.buffer.length > MAX_BUFFER) session.buffer.shift();
              emitter.emit("data", text);
            };
            stream.on("data", push);
            stream.stderr.on("data", push);
            stream.on("close", () => closeSsh(id));
            resolve({ id });
          },
        );
      })
      .on("error", (e: Error) => {
        // Only reject if we never handed back a session (pre-ready failure).
        if (!sessions.has(id)) reject(e);
        else closeSsh(id);
      })
      .connect({
        host: input.host,
        port: input.port ?? 22,
        username: input.username,
        password: input.password,
        readyTimeout: 15_000,
        keepaliveInterval: 20_000,
      });
  });
}

export function sshOwned(id: string, deviceId: string): boolean {
  const s = sessions.get(id);
  return !!s && s.deviceId === deviceId && !s.closed;
}

export function writeSsh(id: string, deviceId: string, data: string): boolean {
  const s = sessions.get(id);
  if (!s || s.deviceId !== deviceId || s.closed || !s.stream) return false;
  s.stream.write(data);
  return true;
}

export function closeSsh(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  s.closed = true;
  try {
    s.stream?.end();
  } catch {
    /* already gone */
  }
  try {
    s.client.end();
  } catch {
    /* already gone */
  }
  s.emitter.emit("close");
  s.emitter.removeAllListeners();
  sessions.delete(id);
}

/** Subscribe to a session's output (replays the retained buffer first). */
export function subscribeSsh(
  id: string,
  deviceId: string,
  onData: (text: string) => void,
  onClose: () => void,
): (() => void) | null {
  const s = sessions.get(id);
  if (!s || s.deviceId !== deviceId) return null;
  for (const chunk of s.buffer) onData(chunk);
  if (s.closed) {
    onClose();
    return () => {};
  }
  s.emitter.on("data", onData);
  s.emitter.on("close", onClose);
  return () => {
    s.emitter.off("data", onData);
    s.emitter.off("close", onClose);
  };
}
