import express from "express";
import os from "node:os";
import qrcode from "qrcode-terminal";
import { issuePairingToken } from "./auth.js";
import { config } from "./config.js";
import { router } from "./routes.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/v1", router);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[gateway]", err.message);
  res.status(502).json({ error: err.message, code: "gateway_error" });
});

function lanUrl(): string {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return `http://${iface.address}:${config.port}`;
      }
    }
  }
  return `http://127.0.0.1:${config.port}`;
}

app.listen(config.port, () => {
  const url = lanUrl();
  const { token, expiresAt } = issuePairingToken();
  const payload = JSON.stringify({ v: 1, gatewayUrl: url, pairingToken: token });
  console.log(`hermes-mobile-gateway v${config.version} on :${config.port}`);
  console.log(`upstream: ${config.upstreamUrl}`);
  console.log(`\nPair your phone (valid ${Math.round((expiresAt - Date.now()) / 60000)} min):`);
  qrcode.generate(payload, { small: true }, (qr: string) => console.log(qr));
  console.log(`or paste manually — gateway: ${url}  token: ${token}\n`);
});
