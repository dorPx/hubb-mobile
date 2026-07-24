import { StyleSheet, View } from "react-native";
import { theme } from "@hermes-mobile/ui";
import { HubSettingsScreen } from "./hub/HubSettingsScreen";
import { TabBar } from "../components/TabBar";

/** Consolidated Settings screen — wraps the unified HubSettingsScreen with bottom TabBar. */
export function SettingsScreen() {
  return (
    <View style={styles.wrap}>
      <View style={styles.content}>
        <HubSettingsScreen />
      </View>
      <TabBar active="settings" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  content: { flex: 1 },
});
