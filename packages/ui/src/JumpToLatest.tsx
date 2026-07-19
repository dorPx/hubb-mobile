import { Pressable, StyleSheet, Text } from "react-native";
import { theme } from "./theme";

export function JumpToLatest({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  if (!visible) return null;
  return (
    <Pressable style={styles.pill} onPress={onPress} accessibilityLabel="Jump to latest" testID="jump-latest">
      <Text style={styles.text}>↓ latest</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    bottom: 84,
    alignSelf: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(2),
  },
  text: { color: theme.accent, fontSize: theme.font.small, fontWeight: "600" },
});
