import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import type { TokenPair } from "@hermes-mobile/shared";

// Credentials live in Android Keystore / iOS Keychain via expo-secure-store;
// web dev builds fall back to localStorage (dev-only surface).
const secure = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async del(key: string): Promise<void> {
    if (Platform.OS === "web") {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

const CRED_KEY = "hermes.credentials";

export interface Credentials {
  gatewayUrl: string;
  tokens: TokenPair;
}

export type Route =
  | { name: "pair" }
  | { name: "sessions" }
  | { name: "chat"; sessionId: string; title: string; provider: string | null; model: string | null }
  | { name: "files"; path?: string }
  | { name: "file"; path: string }
  | { name: "tasks" }
  | { name: "skills" }
  | { name: "insights" };

/** Top-level tabs (routes reachable from the tab bar). */
export type TabName = "sessions" | "files" | "tasks" | "skills" | "insights";

interface AppState {
  hydrated: boolean;
  credentials: Credentials | null;
  route: Route;
  navigate: (route: Route) => void;
  setCredentials: (c: Credentials | null) => void;
  hydrate: () => Promise<void>;
}

export const useApp = create<AppState>((set) => ({
  hydrated: false,
  credentials: null,
  route: { name: "pair" },
  navigate: (route) => set({ route }),
  setCredentials: (credentials) => {
    set({ credentials, route: credentials ? { name: "sessions" } : { name: "pair" } });
    if (credentials) void secure.set(CRED_KEY, JSON.stringify(credentials));
    else void secure.del(CRED_KEY);
  },
  hydrate: async () => {
    try {
      const raw = await secure.get(CRED_KEY);
      if (raw) {
        const credentials = JSON.parse(raw) as Credentials;
        set({ credentials, route: { name: "sessions" }, hydrated: true });
        return;
      }
    } catch {
      /* corrupted credentials → re-pair */
    }
    set({ hydrated: true });
  },
}));

/** Persist rotated tokens without disturbing navigation. */
export function updateTokens(tokens: TokenPair): void {
  const { credentials } = useApp.getState();
  if (!credentials) return;
  const next = { ...credentials, tokens };
  useApp.setState({ credentials: next });
  void secure.set(CRED_KEY, JSON.stringify(next));
}
