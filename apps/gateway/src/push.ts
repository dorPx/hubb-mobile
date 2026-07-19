import { config } from "./config.js";

// Push delivery behind an interface so the gateway core never couples to FCM.
// The noop driver logs intent; the FCM driver is a documented drop-in:
// implement send() with the FCM HTTP v1 API using a service-account JSON
// (env FCM_SERVICE_ACCOUNT_JSON), then set PUSH_DRIVER=fcm.

export interface PushMessage {
  deviceId: string;
  pushToken: string | null;
  title: string;
  body: string;
  /** Deep link, e.g. hermesmobile://session/<id> */
  link: string;
}

export interface PushDriver {
  name: string;
  send(msg: PushMessage): Promise<void>;
}

const noopDriver: PushDriver = {
  name: "noop",
  async send(msg) {
    console.log(`[push:noop] ${msg.title} — ${msg.body} → ${msg.link}`);
  },
};

export function getPushDriver(): PushDriver {
  if (config.pushDriver === "fcm") {
    throw new Error(
      "PUSH_DRIVER=fcm requires implementing the FCM driver (see src/push.ts) and FCM_SERVICE_ACCOUNT_JSON",
    );
  }
  return noopDriver;
}
