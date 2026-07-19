import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "./theme";

/** Chat header: title plus the always-visible active provider/model chip
 * (reference-app failure #5 — never hide what model you're talking to). */
export function ChatHeader({
  title,
  provider,
  model,
  onBack,
  onModelPress,
}: {
  title: string;
  provider: string | null;
  model: string | null;
  onBack: () => void;
  onModelPress: () => void;
}) {
  return (
    <View style={styles.bar}>
      <Pressable onPress={onBack} style={styles.back} accessibilityLabel="Back" testID="header-back">
        <Text style={styles.backText}>‹</Text>
      </Pressable>
      <View style={styles.mid}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Pressable onPress={onModelPress} testID="header-model">
          <Text style={styles.model} numberOfLines={1}>
            {model ? `${provider ?? "?"} · ${model}` : "choose model"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(2),
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.sidebar,
    gap: theme.spacing(2),
  },
  back: { paddingHorizontal: theme.spacing(2), paddingVertical: theme.spacing(1) },
  backText: { color: theme.text, fontSize: 26, lineHeight: 28 },
  mid: { flex: 1 },
  title: { color: theme.text, fontSize: theme.font.title, fontWeight: "600" },
  model: { color: theme.accent, fontSize: theme.font.small, marginTop: 2 },
});
