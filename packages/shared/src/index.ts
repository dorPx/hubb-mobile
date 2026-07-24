import { z } from "zod";

// ---------------------------------------------------------------------------
// Agent events — the gateway tails hermes-webui's SSE stream, stamps each
// event with a monotonic per-session sequence id, persists it, and re-emits.
// Event `type` values mirror the upstream webui streaming contract.
// ---------------------------------------------------------------------------

export const agentEventTypeSchema = z.enum([
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
]);
export type AgentEventType = z.infer<typeof agentEventTypeSchema>;

export const agentEventSchema = z.object({
  seq: z.number().int().nonnegative(),
  sessionId: z.string().min(1),
  type: agentEventTypeSchema,
  /** Raw upstream payload — clients narrow by `type`. */
  data: z.unknown(),
  ts: z.number().int(),
});
export type AgentEvent = z.infer<typeof agentEventSchema>;

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const sessionSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  workspace: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  messageCount: z.number().int().nonnegative(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  /** Highest event seq persisted for this session; clients resume after it. */
  lastSeq: z.number().int().nonnegative(),
  streaming: z.boolean(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const chatSendRequestSchema = z.object({
  message: z.string().min(1),
  model: z.string().optional(),
});
export type ChatSendRequest = z.infer<typeof chatSendRequestSchema>;

// ---------------------------------------------------------------------------
// Models / providers
// ---------------------------------------------------------------------------

export const modelInfoSchema = z.object({
  id: z.string(),
  provider: z.string(),
  label: z.string(),
  available: z.boolean(),
});
export type ModelInfo = z.infer<typeof modelInfoSchema>;

// ---------------------------------------------------------------------------
// Auth & pairing
// ---------------------------------------------------------------------------

export const pairingPayloadSchema = z.object({
  v: z.literal(1),
  gatewayUrl: z.string().url(),
  pairingToken: z.string().min(16),
});
export type PairingPayload = z.infer<typeof pairingPayloadSchema>;

export const pairRequestSchema = z.object({
  pairingToken: z.string().min(16),
  deviceName: z.string().min(1).max(64),
  platform: z.enum(["android", "ios", "web"]),
});
export type PairRequest = z.infer<typeof pairRequestSchema>;

// Username/password login (replaces one-time pairing tokens). By convention
// every password begins with the literal prefix "ssh ".
export const loginRequestSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().startsWith("ssh ", "password must start with 'ssh '").max(128),
  deviceName: z.string().min(1).max(64),
  platform: z.enum(["android", "ios", "web"]),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  /** Unix ms when the access token expires. */
  accessExpiresAt: z.number().int(),
  refreshToken: z.string(),
  deviceId: z.string(),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const deviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  platform: z.string(),
  createdAt: z.number().int(),
  lastSeenAt: z.number().int(),
  revoked: z.boolean(),
});
export type Device = z.infer<typeof deviceSchema>;

// ---------------------------------------------------------------------------
// Gateway health
// ---------------------------------------------------------------------------

export const gatewayHealthSchema = z.object({
  ok: z.boolean(),
  version: z.string(),
  upstream: z.object({
    reachable: z.boolean(),
    activeStreams: z.number().int().nonnegative(),
  }),
});
export type GatewayHealth = z.infer<typeof gatewayHealthSchema>;

export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
