import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { SessionSummary } from "@hermes-mobile/shared";
import { theme } from "@hermes-mobile/ui";
import { gateway } from "../client";
import { useApp } from "../store";

export function SessionsScreen() {
  const navigate = useApp((s) => s.navigate);
  const qc = useQueryClient();
  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => gateway().listSessions(),
  });

  const open = (s: SessionSummary) =>
    navigate({ name: "chat", sessionId: s.id, title: s.title, provider: s.provider, model: s.model });

  const createNew = async () => {
    const s = await gateway().createSession();
    void qc.invalidateQueries({ queryKey: ["sessions"] });
    open(s);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Sessions</Text>
        <Pressable style={styles.newBtn} onPress={createNew} testID="new-session">
          <Text style={styles.newBtnText}>+ New</Text>
        </Pressable>
      </View>
      {isLoading && <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />}
      {!!error && <Text style={styles.error}>{String((error as Error).message)}</Text>}
      <FlatList
        data={data ?? []}
        keyExtractor={(s) => s.id}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={theme.accent} />
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => open(item)} testID={`session-${item.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {item.provider ?? "—"} · {item.model ?? "no model"} · {item.messageCount} msgs
              </Text>
            </View>
            {item.streaming && <View style={styles.liveDot} />}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing(4),
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.sidebar,
  },
  title: { color: theme.text, fontSize: 20, fontWeight: "700" },
  newBtn: {
    backgroundColor: theme.accent,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(1.5),
  },
  newBtnText: { color: theme.bg, fontWeight: "700", fontSize: theme.font.small },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: theme.spacing(2),
  },
  rowTitle: { color: theme.text, fontSize: theme.font.body, fontWeight: "600" },
  rowSub: { color: theme.muted, fontSize: theme.font.small, marginTop: 2 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.success },
  error: { color: theme.error, padding: theme.spacing(4) },
});
