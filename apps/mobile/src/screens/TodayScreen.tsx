import { StyleSheet, View } from "react-native";
import { theme } from "@hermes-mobile/ui";
import { BriefScreen } from "./hub/BriefScreen";
import { TabBar } from "../components/TabBar";

/** Consolidated Today screen — wraps the Cyberpunk dispatch BriefScreen with bottom TabBar. */
export function TodayScreen() {
  return (
    <View style={styles.wrap}>
      <View style={styles.content}>
        <BriefScreen />
      </View>
      <TabBar active="today" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  content: { flex: 1 },
});
