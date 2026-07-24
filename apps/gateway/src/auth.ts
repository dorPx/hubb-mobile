import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { nanoid } from "nanoid";
import type { NextFunction, Request, Response } from "express";
import type { TokenPair } from "@hermes-mobile/shared";
import { config } from "./config.js";
import { db } from "./db.js";

const key = new TextEncoder().encode(config.jwtSecret);
const REFRESH_TTL_MS = 90 * 24 * 3600 * 1000; // 90 days
const PAIRING_TTL_MS = 10 * 60 * 1000; // 10 minutes

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

// ---------------------------------------------------------------- pairing

export function issuePairingToken(): { token: string; expiresAt: number } {
  const token = nanoid(32);
  const expiresAt = Date.now() + PAIRING_TTL_MS;
  db.prepare(
    "INSERT INTO pairing_tokens (token_hash, created_at, expires_at) VALUES (?, ?, ?)",
  ).run(sha256(token), Date.now(), expiresAt);
  return { token, expiresAt };
}

export function consumePairingToken(token: string): boolean {
  const row = db
    .prepare("SELECT expires_at, used FROM pairing_tokens WHERE token_hash = ?")
    .get(sha256(token)) as { expires_at: number; used: number } | undefined;
  if (!row || row.used || row.expires_at < Date.now()) return false;
  db.prepare("UPDATE pairing_tokens SET used = 1 WHERE token_hash = ?").run(sha256(token));
  return true;
}

// -------------------------------------------------------------- login
// Username/password login. The password must start with "ssh " (enforced at the
// schema too). When GATEWAY_USER/GATEWAY_PASSWORD are set, both must match
// exactly; otherwise any username + any "ssh "-prefixed password is accepted.
export function verifyLogin(username: string, password: string): boolean {
  if (!username.trim() || !password.startsWith("ssh ")) return false;
  if (config.gatewayUser && username !== config.gatewayUser) return false;
  if (config.gatewayPassword && password !== config.gatewayPassword) return false;
  return true;
}

// ----------------------------------------------------------------- tokens

async function signAccess(deviceId: string): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Date.now() + config.accessTtlSec * 1000;
  const token = await new SignJWT({ did: deviceId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(key);
  return { token, expiresAt };
}

function issueRefresh(deviceId: string, rotatedFrom?: string): string {
  const token = nanoid(48);
  db.prepare(
    "INSERT INTO refresh_tokens (token_hash, device_id, created_at, expires_at, rotated_from) VALUES (?, ?, ?, ?, ?)",
  ).run(sha256(token), deviceId, Date.now(), Date.now() + REFRESH_TTL_MS, rotatedFrom ?? null);
  return token;
}

export async function registerDevice(
  name: string,
  platform: string,
): Promise<TokenPair> {
  const deviceId = nanoid(16);
  const now = Date.now();
  db.prepare(
    "INSERT INTO devices (id, name, platform, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
  ).run(deviceId, name, platform, now, now);
  const access = await signAccess(deviceId);
  return {
    accessToken: access.token,
    accessExpiresAt: access.expiresAt,
    refreshToken: issueRefresh(deviceId),
    deviceId,
  };
}

/** Rotating refresh: the presented token is retired and a new one issued.
 * A revoked device or unknown/expired token yields null. */
export async function rotateRefresh(refreshToken: string): Promise<TokenPair | null> {
  const hash = sha256(refreshToken);
  const row = db
    .prepare(
      `SELECT rt.device_id, rt.expires_at, d.revoked FROM refresh_tokens rt
       JOIN devices d ON d.id = rt.device_id WHERE rt.token_hash = ?`,
    )
    .get(hash) as { device_id: string; expires_at: number; revoked: number } | undefined;
  if (!row || row.revoked || row.expires_at < Date.now()) return null;
  db.prepare("DELETE FROM refresh_tokens WHERE token_hash = ?").run(hash);
  db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(Date.now(), row.device_id);
  const access = await signAccess(row.device_id);
  return {
    accessToken: access.token,
    accessExpiresAt: access.expiresAt,
    refreshToken: issueRefresh(row.device_id, hash),
    deviceId: row.device_id,
  };
}

export function revokeDevice(deviceId: string): void {
  db.prepare("UPDATE devices SET revoked = 1 WHERE id = ?").run(deviceId);
  db.prepare("DELETE FROM refresh_tokens WHERE device_id = ?").run(deviceId);
}

// ------------------------------------------------------------- middleware

export interface AuthedRequest extends Request {
  deviceId?: string;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing bearer token", code: "no_token" });
  try {
    const { payload } = await jwtVerify(token, key);
    const deviceId = String(payload.did || "");
    const device = db
      .prepare("SELECT revoked FROM devices WHERE id = ?")
      .get(deviceId) as { revoked: number } | undefined;
    if (!device || device.revoked) {
      return res.status(401).json({ error: "device revoked", code: "revoked" });
    }
    req.deviceId = deviceId;
    next();
  } catch {
    return res.status(401).json({ error: "invalid or expired token", code: "expired" });
  }
}
