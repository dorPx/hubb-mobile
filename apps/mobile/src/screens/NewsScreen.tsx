import { StyleSheet, View } from "react-native";
import { theme } from "@hermes-mobile/ui";
import { WireScreen } from "./hub/WireScreen";
import { TabBar } from "../components/TabBar";

/** Consolidated News screen — wraps the three-region WireScreen with bottom TabBar. */
export function NewsScreen() {
  return (
    <View style={styles.wrap}>
      <View style={styles.content}>
        <WireScreen />
      </View>
      <TabBar active="news" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  content: { flex: 1 },
});
