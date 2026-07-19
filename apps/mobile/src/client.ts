import { Platform } from "react-native";
import { GatewayClient, type FetchLike } from "@hermes-mobile/api-client";
import { updateTokens, useApp } from "./store";

// expo/fetch provides streaming response bodies on native; web has it natively.
function streamingFetch(): FetchLike {
  if (Platform.OS === "web") return globalThis.fetch.bind(globalThis);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { fetch: expoFetch } = require("expo/fetch") as { fetch: FetchLike };
  return expoFetch;
}

let cached: { url: string; client: GatewayClient } | null = null;

/** Singleton client bound to the paired gateway; silent refresh on 401
 * (reference-app failure #2 — no credential re-entry, ever). */
export function gateway(): GatewayClient {
  const creds = useApp.getState().credentials;
  if (!creds) throw new Error("not paired");
  if (cached && cached.url === creds.gatewayUrl) return cached.client;
  const client: GatewayClient = new GatewayClient({
    baseUrl: creds.gatewayUrl,
    fetchImpl: streamingFetch(),
    getAccessToken: () => useApp.getState().credentials?.tokens.accessToken ?? null,
    onAuthExpired: async () => {
      const current = useApp.getState().credentials;
      if (!current) return null;
      try {
        const fresh = await client.refresh(current.tokens.refreshToken);
        updateTokens(fresh);
        return fresh.accessToken;
      } catch {
        // refresh rejected (revoked device / expired) → back to pairing
        useApp.getState().setCredentials(null);
        return null;
      }
    },
  });
  cached = { url: creds.gatewayUrl, client };
  return client;
}

export function resetGatewayClient(): void {
  cached = null;
}
