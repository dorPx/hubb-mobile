import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@hermes-mobile/ui";
import { useApp, type TabName } from "../store";

// Core destinations stay one tap away; everything lives in the drawer (☰).
const TABS: { tab: TabName | "menu"; label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap }[] = [
  { tab: "menu", label: "Menu", icon: "menu-outline", iconActive: "menu" },
  { tab: "sessions", label: "Chats", icon: "chatbubble-outline", iconActive: "chatbubble" },
  { tab: "today", label: "Today", icon: "sunny-outline", iconActive: "sunny" },
  { tab: "settings", label: "Settings", icon: "settings-outline", iconActive: "settings" },
];

export function TabBar({ active }: { active: TabName }) {
  const navigate = useApp((s) => s.navigate);
  const setDrawer = useApp((s) => s.setDrawer);
  return (
    <View style={styles.bar}>
      {TABS.map(({ tab, label, icon, iconActive }) => {
        const isActive = active === tab;
        return (
          <Pressable
            key={tab}
            style={styles.item}
            onPress={() => (tab === "menu" ? setDrawer(true) : navigate({ name: tab } as never))}
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
  label: { color: theme.muted, fontSize: 11, fontFamily: theme.fontFamily },
  labelActive: { color: theme.accent, fontWeight: "700" },
});
