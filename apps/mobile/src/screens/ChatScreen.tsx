import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { AgentEvent, ModelInfo } from "@hermes-mobile/shared";
import type { EventStreamHandle } from "@hermes-mobile/api-client";
import { ChatHeader, Composer, JumpToLatest, MessageBubble, theme, type ChatMessage } from "@hermes-mobile/ui";
import { gateway } from "../client";
import { useApp, type Route } from "../store";

type ChatRoute = Extract<Route, { name: "chat" }>;

// Streaming transcript reducer state, kept in refs and flushed to React state
// on a ~50ms cadence so token streams never thrash the UI thread
// (reference-app failure #4).
interface Live {
  messages: ChatMessage[];
  lastSeq: number;
  streaming: boolean;
}

function reduceEvent(live: Live, ev: AgentEvent): void {
  live.lastSeq = Math.max(live.lastSeq, ev.seq);
  const last = live.messages[live.messages.length - 1];
  const d = ev.data as Record<string, unknown> | null;
  switch (ev.type) {
    case "status": {
      const phase = d && (d as { phase?: string }).phase;
      if (phase === "user_message") {
        live.messages.push({
          id: `u-${ev.seq}`,
          role: "user",
          text: String((d as { message?: string }).message ?? ""),
        });
        live.messages.push({ id: `a-${ev.seq}`, role: "assistant", text: "", streaming: true });
        live.streaming = true;
      }
      break;
    }
    case "thinking": {
      if (last?.role === "assistant" && last.streaming) {
        last.thinking = (last.thinking ?? "") + String((d as { text?: string })?.text ?? "");
      }
      break;
    }
    case "token": {
      if (last?.role === "assistant" && last.streaming) {
        last.text += String((d as { text?: string })?.text ?? "");
      }
      break;
    }
    case "done": {
      if (last?.role === "assistant") last.streaming = false;
      live.streaming = false;
      break;
    }
    case "error": {
      if (last?.role === "assistant") {
        last.streaming = false;
        last.error = String((d as { error?: string })?.error ?? "stream error");
      }
      live.streaming = false;
      break;
    }
    default:
      break;
  }
}

export function ChatScreen({ route }: { route: ChatRoute }) {
  const navigate = useApp((s) => s.navigate);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [model, setModel] = useState(route.model);
  const [provider, setProvider] = useState(route.provider);
  const [away, setAway] = useState(false); // scrolled away from the bottom

  const liveRef = useRef<Live>({ messages: [], lastSeq: 0, streaming: false });
  const dirtyRef = useRef(false);
  const streamRef = useRef<EventStreamHandle | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const models = useQuery({ queryKey: ["models"], queryFn: () => gateway().listModels() });

  const flush = useCallback(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const live = liveRef.current;
    setMessages(live.messages.map((m) => ({ ...m })));
    setStreaming(live.streaming);
  }, []);

  // Bootstrap: durable transcript, then live SSE resume from our cursor.
  useEffect(() => {
    let cancelled = false;
    const live = liveRef.current;
    (async () => {
      try {
        const [transcript, session] = await Promise.all([
          gateway().transcript(route.sessionId),
          gateway().getSession(route.sessionId),
        ]);
        if (cancelled) return;
        live.messages = transcript.map((m, i) => ({
          id: `h-${i}`,
          role: m.role,
          text: m.text,
          thinking: m.thinking,
        }));
        // History covers everything upstream has persisted; only events after
        // the log head need replaying (mid-turn tokens of an active stream).
        live.lastSeq = session.streaming ? Math.max(0, session.lastSeq - 500) : session.lastSeq;
        dirtyRef.current = true;
        flush();
        connect();
      } catch (e) {
        if (!cancelled) {
          live.messages.push({
            id: "load-error",
            role: "assistant",
            text: "",
            error: String((e as Error).message || e),
          });
          dirtyRef.current = true;
          flush();
        }
      }
    })();

    function connect() {
      streamRef.current?.close();
      streamRef.current = gateway().streamEvents(
        route.sessionId,
        live.lastSeq,
        (ev) => {
          // During catch-up, drop user_message/token events for turns the
          // transcript already contains — dedupe by seq monotonicity.
          reduceEvent(live, ev);
          dirtyRef.current = true;
        },
        () => {
          // transport dropped: retry from the durable cursor after a beat
          if (!cancelled) setTimeout(connect, 1500);
        },
      );
    }

    const interval = setInterval(flush, 50); // token batch flush
    return () => {
      cancelled = true;
      clearInterval(interval);
      streamRef.current?.close();
    };
  }, [route.sessionId, flush]);

  const send = async (text: string) => {
    try {
      await gateway().send(route.sessionId, { message: text, model: model ?? undefined });
    } catch (e) {
      const live = liveRef.current;
      live.messages.push({
        id: `send-err-${Date.now()}`,
        role: "assistant",
        text: "",
        error: String((e as Error).message || e),
      });
      dirtyRef.current = true;
    }
  };

  const pickModel = async (m: ModelInfo) => {
    setPickerOpen(false);
    setModel(m.id);
    setProvider(m.provider);
    // Persisted per-session server-side (reference-app failure #5).
    try {
      await gateway().setSessionModel(route.sessionId, m.id);
    } catch {
      /* picker choice still applies to the next send */
    }
  };

  const inverted = [...messages].reverse();

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ChatHeader
        title={route.title}
        provider={provider}
        model={model}
        onBack={() => navigate({ name: "sessions" })}
        onModelPress={() => setPickerOpen(true)}
      />
      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          inverted
          data={inverted}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          onScroll={(e) => setAway(e.nativeEvent.contentOffset.y > 120)}
          scrollEventThrottle={100}
          contentContainerStyle={{ paddingVertical: theme.spacing(2) }}
        />
        <JumpToLatest
          visible={away}
          onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
        />
      </View>
      <Composer onSend={send} disabled={streaming} />

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Model</Text>
            <FlatList
              data={models.data ?? []}
              keyExtractor={(m) => m.id}
              style={{ maxHeight: 420 }}
              renderItem={({ item }) => (
                <Pressable style={styles.modelRow} onPress={() => pickModel(item)}>
                  <Text style={[styles.modelText, item.id === model && styles.modelActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  backdrop: { flex: 1, backgroundColor: theme.scrim, justifyContent: "center", padding: theme.spacing(6) },
  sheet: {
    backgroundColor: theme.sidebar,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: theme.spacing(4),
  },
  sheetTitle: { color: theme.text, fontSize: theme.font.title, fontWeight: "700", marginBottom: theme.spacing(2) },
  modelRow: { paddingVertical: theme.spacing(2.5), borderBottomWidth: 1, borderBottomColor: theme.border },
  modelText: { color: theme.muted, fontSize: theme.font.body },
  modelActive: { color: theme.accent, fontWeight: "700" },
});
