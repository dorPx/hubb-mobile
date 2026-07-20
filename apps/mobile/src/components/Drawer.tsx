import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@hermes-mobile/ui";
import { useApp, type TabName } from "../store";

const ITEMS: { tab: TabName; label: string; icon: keyof typeof Ionicons.glyphMap; group: string }[] = [
  { tab: "today", label: "Today", icon: "sunny-outline", group: "Daily" },
  { tab: "news", label: "News wire", icon: "newspaper-outline", group: "Daily" },
  { tab: "markets", label: "Markets", icon: "trending-up-outline", group: "Daily" },
  { tab: "sessions", label: "Chats", icon: "chatbubble-outline", group: "Hermes" },
  { tab: "profile", label: "What am I?", icon: "sparkles-outline", group: "Hermes" },
  { tab: "terminal", label: "Host terminal", icon: "code-slash-outline", group: "Hermes" },
  { tab: "skills", label: "Skills", icon: "extension-puzzle-outline", group: "Hermes" },
  { tab: "tasks", label: "Scheduled tasks", icon: "alarm-outline", group: "Ops" },
  { tab: "files", label: "Files", icon: "folder-outline", group: "Ops" },
  { tab: "insights", label: "Insights", icon: "stats-chart-outline", group: "Ops" },
  { tab: "settings", label: "Settings", icon: "settings-outline", group: "Ops" },
];

/** Slide-in feature drawer — every destination lives here (☰). */
export function Drawer({ active }: { active: TabName }) {
  const open = useApp((s) => s.drawerOpen);
  const setDrawer = useApp((s) => s.setDrawer);
  const navigate = useApp((s) => s.navigate);
  if (!open) return null;

  let lastGroup = "";
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.scrim} onPress={() => setDrawer(false)} testID="drawer-scrim" />
      <View style={styles.panel}>
        <View style={styles.head}>
          <Text style={styles.brand}>HUBB</Text>
          <Pressable onPress={() => setDrawer(false)} hitSlop={12} testID="drawer-close">
            <Ionicons name="close" size={22} color={theme.muted} />
          </Pressable>
        </View>
        <ScrollView>
          {ITEMS.map((it) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            const isActive = active === it.tab;
            return (
              <View key={it.tab}>
                {header && <Text style={styles.group}>{header}</Text>}
                <Pressable
                  style={[styles.row, isActive && styles.rowActive]}
                  onPress={() => navigate({ name: it.tab } as never)}
                  testID={`drawer-${it.tab}`}
                >
                  <Ionicons name={it.icon} size={19} color={isActive ? theme.accent : theme.muted} />
                  <Text style={[styles.label, isActive && styles.labelActive]}>{it.label}</Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.scrim },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 290,
    backgroundColor: theme.sidebar,
    borderRightWidth: 1,
    borderRightColor: theme.border,
    paddingTop: theme.spacing(4),
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing(4),
    paddingBottom: theme.spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  brand: { color: theme.text, fontSize: 19, fontWeight: "800", letterSpacing: 1.2, fontFamily: theme.fontFamily },
  group: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: theme.spacing(4),
    paddingTop: theme.spacing(4),
    paddingBottom: theme.spacing(1),
    fontFamily: theme.fontFamily,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing(3),
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(2.5),
  },
  rowActive: { backgroundColor: theme.surface },
  label: { color: theme.text, fontSize: theme.font.body, fontFamily: theme.fontFamily },
  labelActive: { color: theme.accent, fontWeight: "700" },
});
