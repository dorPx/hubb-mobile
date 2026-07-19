import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.env.DATA_DIR || "./data");
fs.mkdirSync(dataDir, { recursive: true });

// JWT secret must survive restarts or every device gets logged out; if the
// operator didn't provide one, generate once and persist alongside the DB.
function loadJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretFile = path.join(dataDir, "jwt-secret");
  if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, "utf8").trim();
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  return secret;
}

export const config = {
  port: Number(process.env.PORT || 8790),
  upstreamUrl: (process.env.UPSTREAM_URL || "http://127.0.0.1:8787").replace(/\/$/, ""),
  dataDir,
  jwtSecret: loadJwtSecret(),
  accessTtlSec: Number(process.env.ACCESS_TTL || 900),
  pushDriver: process.env.PUSH_DRIVER || "noop",
  version: "0.1.0",
};
