// Dark-first theme lifted from hermes-webui's dark palette (static/style.css)
// so the mobile client reads as the same product family.
export const theme = {
  bg: "#0D0D1A",
  sidebar: "#141425",
  surface: "#1A1A2E",
  border: "#2A2A45",
  text: "#FFF8DC",
  muted: "#C0C0C0",
  accent: "#FFD700",
  accentDim: "#FFBF00",
  info: "#4DD0E1",
  error: "#EF5350",
  success: "#4CAF50",
  warning: "#FFA726",
  userBubble: "#23233C",
  scrim: "rgba(0, 0, 0, 0.65)",
  spacing: (n: number) => n * 4,
  radius: { sm: 6, md: 10, lg: 16 },
  font: {
    body: 15,
    small: 12,
    title: 17,
  },
} as const;

export type Theme = typeof theme;
