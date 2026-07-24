import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@hermes-mobile/ui";
import { useApp } from "../store";

export type HubTab = "comms" | "brief" | "wire" | "board" | "modules" | "hub-settings";

const TABS: {
  tab: HubTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}[] = [
  { tab: "comms", label: "COMMS", icon: "chatbubbles-outline", activeIcon: "chatbubbles" },
  { tab: "brief", label: "BRIEF", icon: "partly-sunny-outline", activeIcon: "partly-sunny" },
  { tab: "wire", label: "NEWS", icon: "newspaper-outline", activeIcon: "newspaper" },
  { tab: "board", label: "BOARD", icon: "grid-outline", activeIcon: "grid" },
  { tab: "modules", label: "MODS", icon: "layers-outline", activeIcon: "layers" },
  { tab: "hub-settings", label: "SET", icon: "settings-outline", activeIcon: "settings" },
];

function clock(): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

/** Shared chrome for the demo-first Hermes Hub command surface. */
export function HubShell({ active, children }: { active: HubTab; children: ReactNode }) {
  const navigate = useApp((s) => s.navigate);
  const credentials = useApp((s) => s.credentials);
  const [time, setTime] = useState(clock);

  useEffect(() => {
    const tick = setInterval(() => setTime(clock()), 1000);
    return () => clearInterval(tick);
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.wordmark}>
            HERMES<Text style={styles.slashes}>//</Text>HUB
          </Text>
          <Text style={styles.clock}>{time}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={credentials ? "Open paired gateway console" : "Pair a Hermes gateway"}
          style={styles.gateway}
          onPress={() => navigate(credentials ? { name: "sessions" } : { name: "pair" })}
          testID="hub-gateway"
        >
          <View style={[styles.statusDot, { backgroundColor: credentials ? theme.success : theme.warning }]} />
          <View>
            <Text style={styles.gatewayLabel}>{credentials ? "GATEWAY" : "DEMO"}</Text>
            <Text style={styles.gatewayState}>{credentials ? "ONLINE" : "LOCAL"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.muted} />
        </Pressable>
      </View>

      <View style={styles.content}>{children}</View>

      <View style={styles.tabBar}>
        {TABS.map(({ tab, label, icon, activeIcon }) => {
          const selected = active === tab;
          return (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={styles.tab}
              onPress={() => navigate({ name: tab })}
              testID={`hub-tab-${tab}`}
            >
              <View style={[styles.tabIndicator, selected && styles.tabIndicatorActive]} />
              <Ionicons name={selected ? activeIcon : icon} size={19} color={selected ? theme.accent : theme.muted} />
              <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: {
    minHeight: 64,
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(2),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.sidebar,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  wordmark: { color: theme.text, fontSize: 19, fontFamily: theme.display, letterSpacing: 1.2 },
  slashes: { color: theme.accent },
  clock: { color: theme.muted, marginTop: 2, fontSize: 11, fontFamily: theme.mono, letterSpacing: 0.8 },
  gateway: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing(2),
    paddingLeft: theme.spacing(2),
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  gatewayLabel: { color: theme.text, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.8 },
  gatewayState: { color: theme.muted, fontFamily: theme.mono, fontSize: 9, letterSpacing: 0.7, marginTop: 1 },
  content: { flex: 1 },
  tabBar: {
    minHeight: 64,
    flexDirection: "row",
    backgroundColor: theme.sidebar,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  tab: { flex: 1, minHeight: 64, alignItems: "center", justifyContent: "center", gap: 3, paddingBottom: 4 },
  tabIndicator: { position: "absolute", top: 0, height: 2, width: "68%", backgroundColor: "transparent" },
  tabIndicatorActive: { backgroundColor: theme.accent },
  tabLabel: { color: theme.muted, fontSize: 8, fontFamily: theme.mono, letterSpacing: 0.5 },
  tabLabelActive: { color: theme.accent, fontFamily: theme.monoMedium },
});
