# HUBB — mobile

Native mobile client for the [Hermes Agent](https://github.com/NousResearch/hermes-agent) ecosystem: an Expo (dev-client) Android app plus a mobile-aware Node gateway, in a modern black / dark-blue / light-blue / white theme. Sibling of the [HUBB dispatch-terminal PWA](https://github.com/dorPx/hubb). The phone is a **viewer, not the executor** — all agent work runs server-side and every event is durably logged, so backgrounding or killing the app never loses a turn.

## Layout (Turborepo)

```
apps/
  mobile/       React Native (Expo SDK 57, dev-client) app
  gateway/      hermes-mobile-gateway — Node/Express, wraps hermes-webui's HTTP API
packages/
  ui/           RN components carrying the hermes-webui dark aesthetic
  api-client/   Typed TS client for the gateway (web + mobile)
  shared/       zod schemas / types shared end to end
upstream/       Reference clones of hermes-agent + hermes-webui (gitignored)
```

## Architecture

```
phone (Expo app)
  │  JWT (rotating refresh, Keystore-stored)
  ▼
hermes-mobile-gateway :8790          ← this repo
  │  per-session event log (SQLite, monotonic seq)
  │  SSE w/ Last-Event-ID replay/resume
  ▼
hermes-webui :8787                   ← nesquena/hermes-webui, unmodified
  ▼
hermes-agent (CLI runtime)           ← NousResearch/hermes-agent, unmodified
```

Neither upstream is forked; the gateway talks to hermes-webui's HTTP+SSE API only. `apps/gateway/src/upstream.ts` is the single file that knows the upstream wire format.

**Why an event log?** The gateway tails each agent turn's SSE stream server-side and appends every event to SQLite with a per-session monotonic `seq`. Clients stream `/v1/sessions/:id/stream` with `Last-Event-ID: <seq>`; the gateway replays everything after that cursor, then goes live. Process death on the phone is a non-event — reconnect and catch up.

## Desktop pairing

1. Start the gateway (below). It prints a QR + one-time pairing token (10-min TTL, single use).
2. In the app: paste gateway URL + token (QR scan lands with the dev-client build).
3. The device gets a JWT access token (15 min) + rotating refresh token (90 days) stored in Android Keystore via expo-secure-store. Re-auth never requires credentials; revoke a lost phone via `POST /v1/devices/:id/revoke`.

Sessions are shared both ways: anything started in desktop WebUI/CLI appears in the app (with full transcript), and turns sent from the phone land in the same store.

## Run it (dev)

```bash
# 1. hermes-webui + hermes-agent (see upstream READMEs), default :8787
# 2. gateway
cd apps/gateway && pnpm build && DATA_DIR=./data PORT=8790 node dist/index.js
# 3. app — web mode for quick iteration:
cd apps/mobile && npx expo start --web
#    or native (needs Android SDK + emulator/device):
cd apps/mobile && npx expo run:android
```

Gateway env (`apps/gateway/.env.example`): `PORT`, `UPSTREAM_URL`, `JWT_SECRET` (auto-generated + persisted if unset), `DATA_DIR`, `ACCESS_TTL`, `PUSH_DRIVER` (`noop` now; FCM driver is a documented drop-in in `src/push.ts` — implement `send()` against FCM HTTP v1 with a service-account JSON, set `PUSH_DRIVER=fcm`).

## Self-hosted gateway (VPS)

Run the gateway next to your existing Hermes install; it only needs to reach hermes-webui over localhost:

```bash
# systemd unit sketch, consistent with a hermes-webui ctl.sh/systemd setup:
[Service]
Environment=UPSTREAM_URL=http://127.0.0.1:8787 PORT=8790 DATA_DIR=/var/lib/hermes-mobile
ExecStart=/usr/bin/node /opt/hermes-mobile/apps/gateway/dist/index.js
Restart=on-failure
```

Migration note: nothing about the existing hermes-agent/webui services changes — the gateway is additive. Give it its own port and data dir; back up `DATA_DIR` (SQLite event log + device registry + JWT secret).

Expose 8790 to your phone via VPN (Tailscale/WireGuard recommended) or TLS reverse proxy. The pairing QR embeds whatever URL the gateway detects; set it explicitly behind a proxy.

## Status / roadmap

Done (verified end-to-end against a live local Hermes):
- Gateway: pairing, JWT + rotating refresh, device registry, event log, SSE resume, chat proxy, transcript, model list/per-session model persistence
- App: pairing, silent session restore, sessions list, chat with history + live streaming (50 ms token batching, stick-to-bottom, jump-to-latest), model picker with always-visible provider/model chip

Next: QR pairing via camera, foreground service + persistent notification during active streams, FCM driver, file browser / tasks / skills / memory / analytics screens, FlashList swap for the chat list, offline MMKV cache, EAS CI.
