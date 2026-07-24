import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@hermes-mobile/ui";
import { gateway } from "../client";
import { TabBar } from "../components/TabBar";

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07?|\x1b[=>]|\r/g;

/** Shell on the Hermes host, rendered in the app. Pair with a VPS gateway and
 * this is your server console — no separate SSH client needed. */
export function TerminalScreen() {
  const [lines, setLines] = useState("");
  const [cmd, setCmd] = useState("");
  const [status, setStatus] = useState<"connecting" | "live" | "dead">("connecting");
  const scroller = useRef<ScrollView | null>(null);
  const sessionRef = useRef<string | null>(null);

  useEffect(() => {
    let handle: { close: () => void } | null = null;
    let buf = "";
    let flushTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    (async () => {
      try {
        const sessions = await gateway().listSessions();
        if (!sessions.length) throw new Error("create a chat session first — the host terminal attaches to one");
        const sid = sessions[0].id;
        sessionRef.current = sid;
        await gateway().terminalStart(sid, 24, 80);
        if (cancelled) return;
        // batch output flushes so bursts don't thrash renders
        flushTimer = setInterval(() => {
          if (!buf) return;
          const chunk = buf;
          buf = "";
          setLines((prev) => (prev + chunk).slice(-40_000));
        }, 80);
        handle = gateway().streamTerminal(
          sid,
          (text) => {
            buf += text.replace(ANSI, "");
          },
          () => setStatus("dead"),
        );
        setStatus("live");
      } catch (e) {
        if (!cancelled) {
          setLines(String((e as Error).message || e));
          setStatus("dead");
        }
      }
    })();
    return () => {
      cancelled = true;
      handle?.close();
      if (flushTimer) clearInterval(flushTimer);
      if (sessionRef.current) void gateway().terminalClose(sessionRef.current);
    };
  }, []);

  const send = () => {
    const sid = sessionRef.current;
    if (!sid || status !== "live") return;
    void gateway().terminalInput(sid, cmd + "\n");
    setCmd("");
  };

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Host terminal</Text>
          <Text style={styles.sub}>Shell on the paired Hermes host — your VPS when paired remotely</Text>
        </View>
        <View
          style={[
            styles.dot,
            { backgroundColor: status === "live" ? theme.success : status === "dead" ? theme.error : theme.warning },
          ]}
        />
      </View>
      <ScrollView
        ref={scroller}
        style={styles.body}
        contentContainerStyle={{ padding: theme.spacing(3) }}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
      >
        <Text style={styles.output} testID="terminal-output">
          {lines || (status === "connecting" ? "connecting…" : "")}
        </Text>
      </ScrollView>
      <View style={styles.inputRow}>
        <Text style={styles.prompt}>$</Text>
        <TextInput
          style={styles.input}
          value={cmd}
          onChangeText={setCmd}
          onSubmitEditing={send}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="command…"
          placeholderTextColor={theme.muted}
          editable={status === "live"}
          testID="terminal-input"
        />
        <Pressable onPress={send} disabled={status !== "live"} hitSlop={8} testID="terminal-send">
          <Ionicons name="return-down-back" size={20} color={status === "live" ? theme.accent : theme.border} />
        </Pressable>
      </View>
      <TabBar active="terminal" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing(3),
    padding: theme.spacing(4),
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.sidebar,
  },
  title: { color: theme.text, fontSize: 20, fontWeight: "700", fontFamily: theme.fontFamily },
  sub: { color: theme.muted, fontSize: 11, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  body: { flex: 1 },
  output: { color: theme.text, fontFamily: "monospace" as const, fontSize: 12, lineHeight: 18 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing(2),
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(2),
    backgroundColor: theme.sidebar,
  },
  prompt: { color: theme.accent, fontFamily: "monospace" as const, fontSize: 14, fontWeight: "700" },
  input: { flex: 1, color: theme.text, fontFamily: "monospace" as const, fontSize: 13, paddingVertical: theme.spacing(1.5) },
});
