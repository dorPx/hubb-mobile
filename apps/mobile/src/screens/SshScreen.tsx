import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useApp } from "../store";

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07?|\x1b[=>]|\r/g;

type Phase = "form" | "connecting" | "live" | "closed";

/** SSH access point: the gateway opens a real SSH shell to any host and bridges
 * it here. The phone never speaks SSH — it drives the relay over the gateway. */
export function SshScreen() {
  const credentials = useApp((s) => s.credentials);
  const navigate = useApp((s) => s.navigate);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState("");
  const [cmd, setCmd] = useState("");
  const scroller = useRef<ScrollView | null>(null);
  const sshId = useRef<string | null>(null);
  const handle = useRef<{ close: () => void } | null>(null);
  const buf = useRef("");
  const flush = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => teardown(), []);

  function teardown() {
    handle.current?.close();
    handle.current = null;
    if (flush.current) clearInterval(flush.current);
    flush.current = null;
    if (sshId.current) void gateway().sshClose(sshId.current);
    sshId.current = null;
  }

  const connect = async () => {
    if (!host.trim() || !username.trim() || !password) {
      setError("Host, username, and password are required.");
      return;
    }
    setError(null);
    setLines("");
    setPhase("connecting");
    try {
      const { sshId: id } = await gateway().sshConnect({
        host: host.trim(),
        port: Number(port) || 22,
        username: username.trim(),
        password,
        rows: 24,
        cols: 80,
      });
      sshId.current = id;
      setPassword(""); // don't keep the secret in component state longer than needed
      flush.current = setInterval(() => {
        if (!buf.current) return;
        const chunk = buf.current;
        buf.current = "";
        setLines((prev) => (prev + chunk).slice(-40_000));
      }, 80);
      handle.current = gateway().streamSsh(
        id,
        (text) => {
          buf.current += text.replace(ANSI, "");
        },
        () => setPhase("closed"),
        (e) => {
          setLines((prev) => prev + `\n[stream error: ${e.message}]`);
          setPhase("closed");
        },
      );
      setPhase("live");
    } catch (e) {
      setError(String((e as Error).message || e));
      setPhase("form");
    }
  };

  const send = () => {
    if (phase !== "live" || !sshId.current) return;
    void gateway().sshInput(sshId.current, cmd + "\n");
    setCmd("");
  };

  const disconnect = () => {
    teardown();
    setPhase("form");
    setLines("");
  };

  if (!credentials) {
    return (
      <View style={styles.wrap}>
        <View style={styles.gate}>
          <Ionicons name="terminal-outline" size={34} color={theme.warning} />
          <Text style={styles.gateTitle}>PAIR A GATEWAY FIRST</Text>
          <Text style={styles.gateText}>The SSH relay runs through your Hermes gateway. Pair one, then return here to open a shell to any host.</Text>
          <Pressable style={styles.gateBtn} onPress={() => navigate({ name: "pair" })}>
            <Text style={styles.gateBtnText}>GO TO PAIRING</Text>
          </Pressable>
        </View>
        <TabBar active="ssh" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>SSH ACCESS POINT</Text>
          <Text style={styles.sub}>
            {phase === "live"
              ? `${username}@${host}`
              : phase === "closed"
                ? "session closed"
                : "relayed through the paired gateway"}
          </Text>
        </View>
        <View style={[styles.dot, { backgroundColor: phase === "live" ? theme.success : phase === "closed" ? theme.error : theme.warning }]} />
      </View>

      {phase === "form" || phase === "connecting" ? (
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>HOST</Text>
          <TextInput style={styles.input} value={host} onChangeText={setHost} placeholder="203.0.113.10 or host.example.com" placeholderTextColor={theme.muted} autoCapitalize="none" autoCorrect={false} testID="ssh-host" />
          <View style={styles.row}>
            <View style={styles.grow}>
              <Text style={styles.label}>USERNAME</Text>
              <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="root" placeholderTextColor={theme.muted} autoCapitalize="none" autoCorrect={false} testID="ssh-user" />
            </View>
            <View style={styles.portCol}>
              <Text style={styles.label}>PORT</Text>
              <TextInput style={styles.input} value={port} onChangeText={setPort} placeholder="22" placeholderTextColor={theme.muted} keyboardType="number-pad" testID="ssh-port" />
            </View>
          </View>
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={theme.muted} secureTextEntry autoCapitalize="none" autoCorrect={false} testID="ssh-pass" />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={[styles.connect, phase === "connecting" && styles.disabled]} onPress={connect} disabled={phase === "connecting"} testID="ssh-connect">
            {phase === "connecting" ? (
              <ActivityIndicator color={theme.onAccent} />
            ) : (
              <>
                <Ionicons name="flash" size={16} color={theme.onAccent} />
                <Text style={styles.connectText}>OPEN SHELL</Text>
              </>
            )}
          </Pressable>
          <Text style={styles.note}>Credentials are used by the gateway to connect and are not stored. Only connect to hosts you control.</Text>
        </ScrollView>
      ) : (
        <>
          <ScrollView
            ref={scroller}
            style={styles.body}
            contentContainerStyle={{ padding: theme.spacing(3) }}
            onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
          >
            <Text style={styles.output} testID="ssh-output">{lines || "connected — awaiting shell…"}</Text>
          </ScrollView>
          <View style={styles.inputRow}>
            <Text style={styles.prompt}>$</Text>
            <TextInput
              style={styles.cmdInput}
              value={cmd}
              onChangeText={setCmd}
              onSubmitEditing={send}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={phase === "live" ? "command…" : "session closed"}
              placeholderTextColor={theme.muted}
              editable={phase === "live"}
              testID="ssh-cmd"
            />
            <Pressable onPress={send} disabled={phase !== "live"} hitSlop={8} testID="ssh-send">
              <Ionicons name="return-down-back" size={20} color={phase === "live" ? theme.accent : theme.border} />
            </Pressable>
            <Pressable onPress={disconnect} hitSlop={8} testID="ssh-disconnect">
              <Ionicons name="close-circle-outline" size={20} color={theme.error} />
            </Pressable>
          </View>
        </>
      )}
      <TabBar active="ssh" />
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
  title: { color: theme.text, fontSize: 19, fontFamily: theme.display, letterSpacing: 0.8 },
  sub: { color: theme.muted, fontSize: 11, marginTop: 2, fontFamily: theme.mono },
  dot: { width: 10, height: 10, borderRadius: 5 },
  form: { padding: theme.spacing(4), gap: theme.spacing(2) },
  label: { color: theme.muted, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.6, marginTop: theme.spacing(2) },
  input: { minHeight: 46, color: theme.text, backgroundColor: theme.bgDeep, borderWidth: 1, borderColor: theme.border, paddingHorizontal: theme.spacing(3), fontFamily: theme.mono, fontSize: 13 },
  row: { flexDirection: "row", gap: theme.spacing(3) },
  grow: { flex: 1 },
  portCol: { width: 96 },
  error: { color: theme.error, fontSize: 12, marginTop: theme.spacing(2) },
  connect: { minHeight: 48, marginTop: theme.spacing(4), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: theme.accentDim, borderTopRightRadius: 12 },
  connectText: { color: theme.onAccent, fontFamily: theme.mono, fontSize: 13, letterSpacing: 0.6 },
  disabled: { opacity: 0.5 },
  note: { color: theme.muted, fontSize: 11, lineHeight: 17, marginTop: theme.spacing(3) },
  body: { flex: 1, backgroundColor: theme.bgDeep },
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
  cmdInput: { flex: 1, color: theme.text, fontFamily: "monospace" as const, fontSize: 13, paddingVertical: theme.spacing(1.5) },
  gate: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing(6), gap: theme.spacing(3) },
  gateTitle: { color: theme.text, fontFamily: theme.display, fontSize: 18, letterSpacing: 0.6, textAlign: "center" },
  gateText: { color: theme.muted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  gateBtn: { minHeight: 46, marginTop: theme.spacing(2), paddingHorizontal: theme.spacing(4), justifyContent: "center", backgroundColor: theme.accentDim, borderTopRightRadius: 12 },
  gateBtnText: { color: theme.onAccent, fontFamily: theme.mono, fontSize: 12, letterSpacing: 0.6 },
});
