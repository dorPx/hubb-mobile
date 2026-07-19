import { StyleSheet, Text, View } from "react-native";
import { theme } from "./theme";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  streaming?: boolean;
  error?: string;
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAgent]}>
      <View style={[styles.bubble, isUser ? styles.user : styles.agent]}>
        {!!message.thinking && !message.text && (
          <Text style={styles.thinking} numberOfLines={3}>
            {message.thinking}
          </Text>
        )}
        {!!message.text && <Text style={styles.text}>{message.text}</Text>}
        {message.streaming && !message.text && !message.thinking && (
          <Text style={styles.thinking}>…</Text>
        )}
        {!!message.error && <Text style={styles.error}>{message.error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: theme.spacing(3), paddingVertical: theme.spacing(1) },
  rowUser: { alignItems: "flex-end" },
  rowAgent: { alignItems: "flex-start" },
  bubble: {
    maxWidth: "88%",
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(2),
  },
  user: { backgroundColor: theme.userBubble, borderWidth: 1, borderColor: theme.border },
  agent: { backgroundColor: theme.surface },
  text: { color: theme.text, fontSize: theme.font.body, lineHeight: 21 },
  thinking: { color: theme.muted, fontSize: theme.font.small, fontStyle: "italic", lineHeight: 16 },
  error: { color: theme.error, fontSize: theme.font.small, marginTop: theme.spacing(1) },
});
