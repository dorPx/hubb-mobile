// HERMES//HUB — the shared visual language, ported 1:1 from the HUBB dispatch
// terminal PWA. Source palette is the PWA's OKLCH system (terminal-at-dusk:
// near-black base, cobalt accent, hue-252 blue-tinted panels); values below are
// the exact sRGB/hex conversions so they render identically on native Android.
export const theme = {
  bg: "#050505", // oklch(0.115 0 0) — app base
  bgDeep: "#020202", // oklch(0.08 0 0) — recessed wells behind the base
  sidebar: "#020202", // recessed shell: header, tab bar, input wells
  surface: "#0A0E12", // oklch(0.16 0.012 252) — cards and controls
  surfaceHigh: "#11171D", // oklch(0.20 0.016 252) — pressed / selected
  border: "#272F38", // oklch(0.30 0.02 252)
  borderDim: "#161B21", // oklch(0.22 0.015 252)
  text: "#E4E8ED", // oklch(0.93 0.008 252) — ink
  muted: "#96A0AB", // oklch(0.70 0.02 252)
  accent: "#5EAFFF", // cobaltBright — interactive text, active state, live
  accentDim: "#007AE5", // cobalt — primary fills
  onAccent: "#FFFFFF", // ink on cobalt fills
  info: "#3BCABB", // teal
  error: "#F05653", // danger
  success: "#4BC680",
  warning: "#FAAB3F", // amber — demo state, MoA / swarm
  // Named palette entries so screens can pull the exact PWA hues directly.
  cobalt: "#007AE5",
  cobaltBright: "#5EAFFF",
  amber: "#FAAB3F",
  teal: "#3BCABB",
  coral: "#EC8A67",
  danger: "#F05653",
  // Per-agent identity colours (HUBB COMMS): Hermes cobalt, Codex teal, Claude coral.
  agentHermes: "#5EAFFF",
  agentCodex: "#3BCABB",
  agentClaude: "#EC8A67",
  userBubble: "#122236", // cobalt-tinted panel for operator messages
  scrim: "rgba(2, 2, 2, 0.66)",
  // Type system — three families, matching the PWA:
  //   IBM Plex Sans   → body / product copy
  //   IBM Plex Mono   → meta lines, tags, status (uppercase, tracked)
  //   Chakra Petch    → display wordmarks and screen titles (the cyberpunk face)
  // Loaded in App root; each falls back to the system face until fonts resolve.
  fontFamily: "IBMPlexSans_400Regular",
  fontFamilyMedium: "IBMPlexSans_500Medium",
  fontFamilyBold: "IBMPlexSans_700Bold",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
  display: "ChakraPetch_700Bold",
  displaySemi: "ChakraPetch_600SemiBold",
  spacing: (n: number) => n * 4,
  radius: { sm: 8, md: 12, lg: 18 },
  font: {
    body: 15,
    small: 12,
    title: 17,
  },
} as const;

export type Theme = typeof theme;
