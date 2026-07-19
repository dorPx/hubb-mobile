import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@hermes-mobile/ui";
import { useApp, type TabName } from "../store";

const TABS: { tab: TabName; label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap }[] = [
  { tab: "sessions", label: "Chats", icon: "chatbubble-outline", iconActive: "chatbubble" },
  { tab: "files", label: "Files", icon: "folder-outline", iconActive: "folder" },
  { tab: "tasks", label: "Tasks", icon: "alarm-outline", iconActive: "alarm" },
  { tab: "skills", label: "Skills", icon: "extension-puzzle-outline", iconActive: "extension-puzzle" },
  { tab: "insights", label: "Insights", icon: "stats-chart-outline", iconActive: "stats-chart" },
];

export function TabBar({ active }: { active: TabName }) {
  const navigate = useApp((s) => s.navigate);
  return (
    <View style={styles.bar}>
      {TABS.map(({ tab, label, icon, iconActive }) => {
        const isActive = active === tab;
        return (
          <Pressable
            key={tab}
            style={styles.item}
            onPress={() => navigate(tab === "files" ? { name: "files" } : { name: tab })}
            testID={`tab-${tab}`}
          >
            <Ionicons
              name={isActive ? iconActive : icon}
              size={21}
              color={isActive ? theme.accent : theme.muted}
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.sidebar,
    paddingBottom: 4,
  },
  item: { flex: 1, alignItems: "center", paddingVertical: theme.spacing(2), gap: 3 },
  label: { color: theme.muted, fontSize: 11 },
  labelActive: { color: theme.accent, fontWeight: "700" },
});
