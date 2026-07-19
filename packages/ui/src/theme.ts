// HUBB theme — modern black / dark blue / light blue / white.
// Restrained product register: near-black base, dark-blue panel layer,
// a single light-blue accent for actions/selection, white ink.
export const theme = {
  bg: "#05070D", // black, blue-cast
  sidebar: "#0A101C", // panel layer (headers, tab bar)
  surface: "#0E1626", // dark blue cards/inputs
  surfaceHigh: "#15203A", // pressed/hover layer
  border: "#1B2A45",
  text: "#F4F7FF", // white ink
  muted: "#8FA5C9", // blue-gray secondary (≥4.5:1 on bg and surface)
  accent: "#57A8FF", // light blue — actions, selection, live state
  accentDim: "#2F7FE0",
  onAccent: "#04121F", // ink on accent fills
  info: "#6FC3FF",
  error: "#FF7A7A",
  success: "#45D68A",
  warning: "#FFC061",
  userBubble: "#132441", // user chat bubble, dark blue
  scrim: "rgba(2, 6, 14, 0.7)",
  spacing: (n: number) => n * 4,
  radius: { sm: 8, md: 12, lg: 18 },
  font: {
    body: 15,
    small: 12,
    title: 17,
  },
} as const;

export type Theme = typeof theme;
