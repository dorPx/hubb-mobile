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
  | { name: "comms" }
  | { name: "brief" }
  | { name: "wire" }
  | { name: "board" }
  | { name: "modules" }
  | { name: "hub-settings" }
  | { name: "sessions" }
  | { name: "chat"; sessionId: string; title: string; provider: string | null; model: string | null }
  | { name: "files"; path?: string }
  | { name: "file"; path: string }
  | { name: "tasks" }
  | { name: "skills" }
  | { name: "insights" }
  | { name: "today" }
  | { name: "news" }
  | { name: "markets" }
  | { name: "profile" }
  | { name: "terminal" }
  | { name: "ssh" }
  | { name: "settings" };

/** Destinations reachable from the drawer / tab bar. */
export type TabName =
  | "sessions" | "today" | "news" | "markets" | "files" | "tasks"
  | "skills" | "insights" | "profile" | "terminal" | "ssh" | "settings";

interface AppState {
  hydrated: boolean;
  credentials: Credentials | null;
  route: Route;
  drawerOpen: boolean;
  setDrawer: (open: boolean) => void;
  navigate: (route: Route) => void;
  setCredentials: (c: Credentials | null) => void;
  hydrate: () => Promise<void>;
}

export const useApp = create<AppState>((set) => ({
  hydrated: false,
  credentials: null,
  // The hub is the demo-first home surface; the gateway console is one tap away.
  route: { name: "comms" },
  drawerOpen: false,
  setDrawer: (drawerOpen) => set({ drawerOpen }),
  navigate: (route) => set({ route, drawerOpen: false }),
  setCredentials: (credentials) => {
    // Pairing lands in the gateway console; unpairing returns to the hub.
    set({ credentials, route: credentials ? { name: "sessions" } : { name: "comms" } });
    if (credentials) void secure.set(CRED_KEY, JSON.stringify(credentials));
    else void secure.del(CRED_KEY);
  },
  hydrate: async () => {
    try {
      const raw = await secure.get(CRED_KEY);
      if (raw) {
        const credentials = JSON.parse(raw) as Credentials;
        set({ credentials, hydrated: true });
        return;
      }
    } catch {
      /* corrupted credentials → re-pair from the hub */
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

// ---------------------------------------------------------------------------
// Hermes Hub local command-surface state
// ---------------------------------------------------------------------------

export type HubAgent = "hermes" | "openai" | "claude";
export type BoardLane = "queue" | "active" | "shipped";
export type HubModuleId = "memory" | "timer" | "ping";

export interface HubMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  swarm?: boolean;
}

/** Per-agent OpenAI-compatible endpoint (base URL + key + model). Empty = demo. */
export interface AgentEndpoint {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const emptyEndpoint = (): AgentEndpoint => ({ baseUrl: "", apiKey: "", model: "" });

/** A connected Google account (read-only). Access token only — refresh needs a
 * server, so the app re-consents when it expires (matching the PWA). */
export interface GoogleAccount {
  accessToken: string;
  expiresAt: number;
  email: string;
  scopes: string[];
}

export interface BoardTask {
  id: string;
  title: string;
  lane: BoardLane;
  createdAt: number;
}

interface HubSnapshot {
  callsign: string;
  temperatureUnit: "F" | "C";
  city: string;
  selectedAgent: HubAgent;
  moaArmed: boolean;
  conversations: Record<HubAgent, HubMessage[]>;
  board: BoardTask[];
  installedModules: HubModuleId[];
  notes: string;
  endpoints: Record<HubAgent, AgentEndpoint>;
  googleClientId: string;
  google: GoogleAccount | null;
}

const HUB_KEY = "hermes.hub.dispatch.v1";

const starterBoard: BoardTask[] = [
  { id: "OPS-001", title: "Review the dispatch briefing", lane: "queue", createdAt: Date.now() - 86_400_000 },
  { id: "OPS-002", title: "Wire the Hermes gateway", lane: "active", createdAt: Date.now() - 43_200_000 },
  { id: "OPS-003", title: "Set a local news area", lane: "queue", createdAt: Date.now() - 18_000_000 },
  { id: "OPS-004", title: "Install the mobile command surface", lane: "shipped", createdAt: Date.now() - 172_800_000 },
  { id: "OPS-005", title: "Check fleet availability", lane: "shipped", createdAt: Date.now() - 259_200_000 },
];

const starterConversations: Record<HubAgent, HubMessage[]> = {
  hermes: [
    {
      id: "welcome-hermes",
      role: "assistant",
      text: "Channel open. I can plan, investigate, and coordinate the next move. Pair a gateway when you want this console to operate your live Hermes sessions.",
      createdAt: Date.now() - 60_000,
    },
  ],
  openai: [
    {
      id: "welcome-openai",
      role: "assistant",
      text: "OpenAI channel online in demo mode. Add an API key in Settings to stream live completions, or send a task now for a demo readout.",
      createdAt: Date.now() - 60_000,
    },
  ],
  claude: [
    {
      id: "welcome-claude",
      role: "assistant",
      text: "Terminal operator standing by. I will keep the handoff compact and leave clear next actions.",
      createdAt: Date.now() - 60_000,
    },
  ],
};

const emptyEndpoints = (): Record<HubAgent, AgentEndpoint> => ({
  hermes: emptyEndpoint(),
  openai: emptyEndpoint(),
  claude: emptyEndpoint(),
});

const hubDefaults: HubSnapshot = {
  callsign: "OPERATOR",
  temperatureUnit: "F",
  city: "",
  selectedAgent: "hermes",
  moaArmed: false,
  conversations: starterConversations,
  board: starterBoard,
  installedModules: ["memory"],
  notes: "",
  endpoints: emptyEndpoints(),
  googleClientId: "",
  google: null,
};

function cloneHubDefaults(): HubSnapshot {
  return {
    ...hubDefaults,
    conversations: {
      hermes: [...starterConversations.hermes],
      openai: [...starterConversations.openai],
      claude: [...starterConversations.claude],
    },
    board: [...starterBoard],
    installedModules: [...hubDefaults.installedModules],
    endpoints: emptyEndpoints(),
    google: null,
  };
}

interface HubState extends HubSnapshot {
  hubHydrated: boolean;
  hydrateHub: () => Promise<void>;
  setHubOperator: (callsign: string) => void;
  setHubUnit: (unit: "F" | "C") => void;
  setHubCity: (city: string) => void;
  selectHubAgent: (agent: HubAgent) => void;
  setMoaArmed: (armed: boolean) => void;
  appendHubMessage: (agent: HubAgent, message: HubMessage) => void;
  clearHubConversation: (agent: HubAgent) => void;
  addBoardTask: (title: string, lane?: BoardLane) => void;
  editBoardTask: (id: string, title: string) => void;
  moveBoardTask: (id: string, lane: BoardLane) => void;
  removeBoardTask: (id: string) => void;
  resetBoard: () => void;
  toggleModule: (id: HubModuleId) => void;
  setHubNotes: (notes: string) => void;
  setAgentEndpoint: (agent: HubAgent, patch: Partial<AgentEndpoint>) => void;
  setGoogleClientId: (id: string) => void;
  setGoogleAccount: (account: GoogleAccount | null) => void;
  resetHub: () => void;
}

function persistHub(snapshot: HubSnapshot): void {
  void secure.set(HUB_KEY, JSON.stringify(snapshot));
}

export const useHub = create<HubState>((set, get) => {
  const snapshot = (): HubSnapshot => {
    const state = get();
    return {
      callsign: state.callsign,
      temperatureUnit: state.temperatureUnit,
      city: state.city,
      selectedAgent: state.selectedAgent,
      moaArmed: state.moaArmed,
      conversations: state.conversations,
      board: state.board,
      installedModules: state.installedModules,
      notes: state.notes,
      endpoints: state.endpoints,
      googleClientId: state.googleClientId,
      google: state.google,
    };
  };
  const update = (next: Partial<HubSnapshot>) => {
    set(next);
    persistHub({ ...snapshot(), ...next });
  };

  return {
    ...cloneHubDefaults(),
    hubHydrated: false,
    hydrateHub: async () => {
      try {
        const raw = await secure.get(HUB_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<HubSnapshot>;
          set({
            ...cloneHubDefaults(),
            ...saved,
            conversations: { ...cloneHubDefaults().conversations, ...saved.conversations },
            board: Array.isArray(saved.board) ? saved.board : [...starterBoard],
            installedModules: Array.isArray(saved.installedModules)
              ? saved.installedModules
              : [...hubDefaults.installedModules],
            notes: typeof saved.notes === "string" ? saved.notes : "",
            endpoints: { ...emptyEndpoints(), ...saved.endpoints },
            googleClientId: typeof saved.googleClientId === "string" ? saved.googleClientId : "",
            google: saved.google ?? null,
            hubHydrated: true,
          });
          return;
        }
      } catch {
        // A malformed local snapshot should never block the command surface.
      }
      set({ hubHydrated: true });
    },
    setHubOperator: (callsign) => update({ callsign }),
    setHubUnit: (temperatureUnit) => update({ temperatureUnit }),
    setHubCity: (city) => update({ city }),
    selectHubAgent: (selectedAgent) => update({ selectedAgent, moaArmed: selectedAgent === "hermes" ? get().moaArmed : false }),
    setMoaArmed: (moaArmed) => update({ moaArmed }),
    appendHubMessage: (agent, message) => {
      const conversations = { ...get().conversations, [agent]: [...get().conversations[agent], message] };
      update({ conversations });
    },
    clearHubConversation: (agent) => update({ conversations: { ...get().conversations, [agent]: [] } }),
    addBoardTask: (title, lane = "queue") => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const nums = get().board
        .map((task) => Number(task.id.replace("OPS-", "")))
        .filter((n) => Number.isFinite(n));
      const id = `OPS-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
      update({ board: [...get().board, { id, title: trimmed, lane, createdAt: Date.now() }] });
    },
    editBoardTask: (id, title) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      update({ board: get().board.map((task) => (task.id === id ? { ...task, title: trimmed } : task)) });
    },
    moveBoardTask: (id, lane) => update({ board: get().board.map((task) => (task.id === id ? { ...task, lane } : task)) }),
    removeBoardTask: (id) => update({ board: get().board.filter((task) => task.id !== id) }),
    resetBoard: () => update({ board: [...starterBoard] }),
    toggleModule: (id) => {
      const installed = get().installedModules;
      update({ installedModules: installed.includes(id) ? installed.filter((m) => m !== id) : [...installed, id] });
    },
    setHubNotes: (notes) => update({ notes }),
    setAgentEndpoint: (agent, patch) =>
      update({ endpoints: { ...get().endpoints, [agent]: { ...get().endpoints[agent], ...patch } } }),
    setGoogleClientId: (googleClientId) => update({ googleClientId }),
    setGoogleAccount: (google) => update({ google }),
    resetHub: () => {
      const fresh = cloneHubDefaults();
      set(fresh);
      persistHub(fresh);
    },
  };
});
