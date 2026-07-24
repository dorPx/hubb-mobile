import { useEffect, useMemo, useRef, useState } from "react";
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
import { isEndpointLive, runChat } from "../../chat";
import { type HubAgent, useApp, useHub } from "../../store";

const AGENTS: { id: HubAgent; tag: string; name: string; detail: string; color: string }[] = [
  { id: "hermes", tag: "HRM", name: "Hermes", detail: "reasoning core", color: theme.agentHermes },
  { id: "openai", tag: "OAI", name: "OpenAI", detail: "general model", color: theme.agentCodex },
  { id: "claude", tag: "CLD", name: "Claude", detail: "terminal operator", color: theme.agentClaude },
];

const SUGGESTIONS = ["Plan today’s top priority", "What should I investigate?", "Turn this into next actions"];

function systemFor(name: string): string {
  return `You are ${name}, part of the operator's HUBB agent fleet — a cyberpunk dispatch console. Be concise, direct, and practical. Lead with the outcome, then the supporting detail.`;
}

function demoReply(agent: HubAgent, prompt: string, swarm: boolean): string {
  const compact = prompt.trim().replace(/\s+/g, " ");
  if (swarm) {
    return `Swarm synthesis: the clearest first move is to define the outcome for “${compact}”, identify the one dependency that could block it, and create an active board item with a concrete check-in. I would ship the smallest useful version first, then review the signal it produces.`;
  }
  if (agent === "openai") {
    return `Implementation readout: start by locating the owning screen and state boundary for “${compact}”. Make one vertical slice work end to end, keep the network path optional, and typecheck before widening the change. Add an API key in Settings to stream live completions.`;
  }
  if (agent === "claude") {
    return `Operator note: I would treat “${compact}” as a short runbook — establish the current state, run the least risky command that gives evidence, then record the result and the next handoff.`;
  }
  return `Dispatch readout: “${compact}” is ready to move. I’d put one explicit outcome on the board, make the next action small enough to finish in one pass, and use the result to decide what earns deeper work.`;
}

/** Demo-first agent channel. Live Hermes sessions remain one tap away in the gateway. */
export function CommsScreen() {
  const credentials = useApp((s) => s.credentials);
  const navigate = useApp((s) => s.navigate);
  const selectedAgent = useHub((s) => s.selectedAgent);
  const conversations = useHub((s) => s.conversations);
  const moaArmed = useHub((s) => s.moaArmed);
  const selectAgent = useHub((s) => s.selectHubAgent);
  const setMoa = useHub((s) => s.setMoaArmed);
  const append = useHub((s) => s.appendHubMessage);
  const clear = useHub((s) => s.clearHubConversation);
  const endpoint = useHub((s) => s.endpoints[s.selectedAgent]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [partial, setPartial] = useState("");
  const list = useRef<ScrollView>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const current = AGENTS.find((agent) => agent.id === selectedAgent) ?? AGENTS[0];
  const messages = conversations[selectedAgent];
  const live = isEndpointLive(endpoint);

  useEffect(() => {
    list.current?.scrollToEnd({ animated: true });
  }, [messages.length, streaming, partial]);

  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
    abort.current?.abort();
  }, []);

  const status = useMemo(
    () => `${current.tag} // ${live ? `LIVE · ${endpoint.model.toUpperCase()}` : "DEMO"}${moaArmed ? " · SWARM ARMED" : ""}`,
    [current.tag, live, endpoint.model, moaArmed],
  );

  const send = (value = draft) => {
    const text = value.trim();
    if (!text || streaming) return;
    setDraft("");
    const userMsg = { id: `u-${Date.now()}`, role: "user" as const, text, createdAt: Date.now() };
    append(selectedAgent, userMsg);
    setStreaming(true);
    const swarm = selectedAgent === "hermes" && moaArmed;

    // Live path: any agent with a configured OpenAI-compatible endpoint (MoA stays demo).
    if (live && !swarm) {
      setPartial("");
      const controller = new AbortController();
      abort.current = controller;
      const historyForCall = [...messages, userMsg];
      void runChat(endpoint, historyForCall, systemFor(current.name), (chunk) => setPartial((p) => p + chunk), controller.signal).then(
        (result) => {
          if (controller.signal.aborted) return;
          const failed = !!result.error && result.error !== "aborted";
          append(selectedAgent, {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: failed ? `⚠ ${current.name} endpoint error: ${result.error}` : result.text || "(empty response)",
            createdAt: Date.now(),
          });
          setStreaming(false);
          setPartial("");
          abort.current = null;
        },
      );
      return;
    }

    // Demo path (no key configured, or MoA swarm armed).
    pending.current = setTimeout(() => {
      append(selectedAgent, {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: demoReply(selectedAgent, text, swarm),
        createdAt: Date.now(),
        swarm,
      });
      setStreaming(false);
      pending.current = null;
    }, swarm ? 950 : 650);
  };

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.agentRow}>
        {AGENTS.map((agent) => {
          const active = selectedAgent === agent.id;
          return (
            <Pressable
              key={agent.id}
              style={[styles.agentChip, active && { borderColor: agent.color, backgroundColor: theme.surfaceHigh }]}
              onPress={() => selectAgent(agent.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              testID={`comms-agent-${agent.id}`}
            >
              <View style={[styles.agentDot, { backgroundColor: agent.color }]} />
              <Text style={[styles.agentTag, active && { color: theme.text }]}>{agent.tag}</Text>
              {active && <Text style={styles.agentName}>{agent.name}</Text>}
            </Pressable>
          );
        })}
        <Pressable
          style={[styles.moa, selectedAgent === "hermes" && moaArmed && styles.moaArmed, selectedAgent !== "hermes" && styles.disabled]}
          onPress={() => selectedAgent === "hermes" && setMoa(!moaArmed)}
          disabled={selectedAgent !== "hermes"}
          accessibilityRole="switch"
          accessibilityState={{ checked: moaArmed, disabled: selectedAgent !== "hermes" }}
          testID="comms-moa"
        >
          <Ionicons name="git-merge-outline" size={15} color={moaArmed ? theme.warning : theme.muted} />
          <Text style={[styles.moaText, moaArmed && { color: theme.warning }]}>MOA</Text>
        </Pressable>
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.liveDot, { backgroundColor: live ? theme.success : theme.warning }]} />
        <Text style={styles.status}>{status}</Text>
        <Pressable
          style={styles.clearButton}
          onPress={() => clear(selectedAgent)}
          accessibilityLabel="Clear conversation"
          testID="comms-clear"
        >
          <Ionicons name="trash-outline" size={17} color={theme.muted} />
        </Pressable>
      </View>

      <ScrollView
        ref={list}
        style={styles.log}
        contentContainerStyle={styles.logContent}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>COMMS CHANNEL OPEN</Text>
            <Text style={styles.emptyText}>Use Hermes for a focused answer, or arm MoA to ask a small advisory swarm before it responds.</Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((suggestion) => (
                <Pressable key={suggestion} style={styles.suggestion} onPress={() => setDraft(suggestion)}>
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {messages.map((message) => (
          <View key={message.id} style={[styles.message, message.role === "user" && styles.userMessage]}>
            {message.role === "assistant" && (
              <View style={styles.messageMeta}>
                <View style={[styles.agentDot, { backgroundColor: current.color }]} />
                <Text style={styles.messageTag}>{current.tag} · {current.name.toUpperCase()}</Text>
                {message.swarm && <Text style={styles.swarmMeta}>// SWARM</Text>}
                <Text style={styles.time}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
              </View>
            )}
            {message.swarm && (
              <View style={styles.trace}>
                <Text style={styles.traceTitle}>SWARM TRACE — FUSED · 3</Text>
                <Text style={styles.traceText}>ANALYST · SKEPTIC · ARCHITECT</Text>
              </View>
            )}
            <Text style={[styles.messageText, message.role === "user" && styles.userText]}>{message.text}</Text>
          </View>
        ))}
        {streaming && (
          <View style={styles.message}>
            {moaArmed && <Text style={styles.traceTitle}>SWARM TRACE — FUSING PROPOSALS…</Text>}
            {partial ? (
              <>
                <View style={styles.messageMeta}>
                  <View style={[styles.agentDot, { backgroundColor: current.color }]} />
                  <Text style={styles.messageTag}>{current.tag} · {current.name.toUpperCase()}</Text>
                  <Text style={styles.swarmMeta}>// LIVE</Text>
                </View>
                <Text style={styles.messageText}>{partial}<Text style={styles.caret}>▍</Text></Text>
              </>
            ) : (
              <Text style={styles.receiving}>RECEIVING <Text style={styles.caret}>▍</Text></Text>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={`Transmit to ${current.name}…`}
          placeholderTextColor={theme.muted}
          style={styles.input}
          multiline
          maxLength={1800}
          textAlignVertical="top"
          testID="comms-input"
        />
        <Pressable
          style={[styles.send, (!draft.trim() || streaming) && styles.sendDisabled]}
          onPress={() => send()}
          disabled={!draft.trim() || streaming}
          accessibilityLabel="Send message"
          testID="comms-send"
        >
          <Ionicons name="arrow-up" size={21} color={theme.onAccent} />
        </Pressable>
      </View>
      <Pressable style={styles.gatewayLink} onPress={() => navigate(credentials ? { name: "sessions" } : { name: "pair" })}>
        <Text style={styles.gatewayLinkText}>{credentials ? "OPEN LIVE HERMES SESSIONS →" : "PAIR A GATEWAY FOR LIVE SESSIONS →"}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  agentRow: { flexDirection: "row", gap: 6, paddingHorizontal: theme.spacing(3), paddingTop: theme.spacing(3), paddingBottom: theme.spacing(2) },
  agentChip: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 9, backgroundColor: theme.surface, borderRadius: 8 },
  agentDot: { width: 7, height: 7, borderRadius: 4 },
  agentTag: { color: theme.muted, fontSize: 10, fontFamily: theme.mono, letterSpacing: 0.7 },
  agentName: { color: theme.text, fontSize: 11, fontFamily: theme.fontFamilyBold },
  moa: { minHeight: 38, marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 8, borderRadius: 8 },
  moaArmed: { borderColor: theme.warning, backgroundColor: "#332817" },
  moaText: { color: theme.muted, fontSize: 10, fontFamily: theme.mono, letterSpacing: 0.6 },
  disabled: { opacity: 0.45 },
  statusRow: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: theme.spacing(3), borderBottomWidth: 1, borderBottomColor: theme.border },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  status: { flex: 1, color: theme.muted, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.55 },
  clearButton: { minHeight: 34, minWidth: 38, alignItems: "center", justifyContent: "center" },
  log: { flex: 1 },
  logContent: { padding: theme.spacing(3), gap: theme.spacing(3), flexGrow: 1 },
  empty: { flex: 1, justifyContent: "center", paddingHorizontal: theme.spacing(2) },
  emptyTitle: { color: theme.text, fontSize: 20, fontFamily: theme.display, letterSpacing: 0.8 },
  emptyText: { color: theme.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  suggestions: { marginTop: theme.spacing(4), gap: theme.spacing(2) },
  suggestion: { minHeight: 44, justifyContent: "center", borderWidth: 1, borderColor: theme.border, paddingHorizontal: theme.spacing(3), backgroundColor: theme.surface },
  suggestionText: { color: theme.accent, fontSize: 13, fontFamily: theme.fontFamilyMedium },
  message: { alignSelf: "stretch", gap: 6 },
  userMessage: { alignSelf: "flex-end", maxWidth: "86%", backgroundColor: theme.userBubble, padding: theme.spacing(3), borderRadius: 12 },
  messageMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  messageTag: { color: theme.muted, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.45 },
  swarmMeta: { color: theme.warning, fontFamily: theme.mono, fontSize: 10 },
  time: { color: theme.muted, fontFamily: theme.mono, fontSize: 10, marginLeft: "auto" },
  messageText: { color: theme.text, fontSize: 15, lineHeight: 22 },
  userText: { color: theme.text },
  trace: { borderWidth: 1, borderColor: theme.warning, backgroundColor: "#272116", padding: theme.spacing(2), gap: 3 },
  traceTitle: { color: theme.warning, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.5 },
  traceText: { color: theme.muted, fontFamily: theme.mono, fontSize: 10 },
  receiving: { color: theme.accent, fontFamily: theme.mono, fontSize: 11, letterSpacing: 0.6 },
  caret: { color: theme.accent, fontSize: 15 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.sidebar, padding: theme.spacing(2) },
  input: { flex: 1, minHeight: 46, maxHeight: 116, color: theme.text, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, paddingHorizontal: theme.spacing(3), paddingTop: 11, paddingBottom: 8, fontSize: 15 },
  send: { width: 46, height: 46, alignItems: "center", justifyContent: "center", backgroundColor: theme.accentDim, borderTopRightRadius: 10 },
  sendDisabled: { opacity: 0.45 },
  gatewayLink: { minHeight: 34, alignItems: "center", justifyContent: "center", backgroundColor: theme.sidebar },
  gatewayLinkText: { color: theme.accent, fontSize: 10, fontFamily: theme.mono, letterSpacing: 0.5 },
});
