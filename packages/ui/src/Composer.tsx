import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { theme } from "./theme";

export function Composer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const canSend = !disabled && text.trim().length > 0;
  const send = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
  };
  return (
    <View style={styles.bar}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Message Hermes…"
        placeholderTextColor={theme.muted}
        multiline
        onSubmitEditing={send}
        blurOnSubmit={false}
        testID="composer-input"
      />
      <Pressable
        onPress={send}
        disabled={!canSend}
        style={[styles.send, !canSend && styles.sendDisabled]}
        accessibilityLabel="Send message"
        testID="composer-send"
      >
        <Text style={[styles.sendText, !canSend && styles.sendTextDisabled]}>➤</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.spacing(2),
    padding: theme.spacing(3),
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.sidebar,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    color: theme.text,
    fontSize: theme.font.body,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(2.5),
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.md,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  sendText: { color: theme.bg, fontSize: 16, fontWeight: "700" },
  sendTextDisabled: { color: theme.muted },
});
