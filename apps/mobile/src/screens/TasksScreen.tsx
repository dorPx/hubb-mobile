import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { CronJob } from "@hermes-mobile/api-client";
import { theme } from "@hermes-mobile/ui";
import { gateway } from "../client";
import { TabBar } from "../components/TabBar";

/** Scheduled tasks / automations (upstream cron jobs), with pause/resume/run. */
export function TasksScreen() {
  const qc = useQueryClient();
  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => gateway().tasks(),
  });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "pause" | "resume" | "run" }) =>
      gateway().taskAction(id, action),
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const renderJob = ({ item }: { item: CronJob }) => (
    <View style={styles.card} testID={`task-${item.id}`}>
      <View style={styles.cardHead}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={[styles.badge, item.paused ? styles.badgePaused : styles.badgeActive]}>
          <Text style={styles.badgeText}>{item.paused ? "PAUSED" : "ACTIVE"}</Text>
        </View>
      </View>
      <Text style={styles.prompt} numberOfLines={2}>
        {item.prompt}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {item.schedule || "no schedule"} · {item.provider ?? "default"} · {item.model ?? "default model"}
      </Text>
      <View style={styles.actions}>
        <Pressable
          style={styles.actionBtn}
          disabled={act.isPending}
          onPress={() => act.mutate({ id: item.id, action: item.paused ? "resume" : "pause" })}
          testID={`task-${item.id}-toggle`}
        >
          <Text style={styles.actionText}>{item.paused ? "Resume" : "Pause"}</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.runBtn]}
          disabled={act.isPending}
          onPress={() => act.mutate({ id: item.id, action: "run" })}
          testID={`task-${item.id}-run`}
        >
          <Text style={[styles.actionText, styles.runText]}>Run now</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Scheduled tasks</Text>
      </View>
      {isLoading && <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />}
      {!!error && <Text style={styles.error}>{(error as Error).message}</Text>}
      <FlatList
        data={data ?? []}
        keyExtractor={(j) => j.id}
        contentContainerStyle={{ padding: theme.spacing(3), gap: theme.spacing(3) }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={theme.accent} />
        }
        ListEmptyComponent={
          !isLoading ? <Text style={styles.empty}>No scheduled tasks yet.</Text> : null
        }
        renderItem={renderJob}
      />
      <TabBar active="tasks" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  header: {
    padding: theme.spacing(4),
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.sidebar,
  },
  title: { color: theme.text, fontSize: 20, fontWeight: "700" },
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: theme.spacing(3),
    gap: theme.spacing(1.5),
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing(2) },
  name: { color: theme.text, fontSize: theme.font.body, fontWeight: "700", flex: 1 },
  badge: { borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(1.5), paddingVertical: 2 },
  badgeActive: { backgroundColor: "rgba(69, 214, 138, 0.14)" },
  badgePaused: { backgroundColor: "rgba(255, 122, 122, 0.14)" },
  badgeText: { color: theme.text, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  prompt: { color: theme.muted, fontSize: theme.font.small, lineHeight: 18 },
  meta: { color: theme.muted, fontSize: 11 },
  actions: { flexDirection: "row", gap: theme.spacing(2), marginTop: theme.spacing(1) },
  actionBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(1.5),
  },
  runBtn: { backgroundColor: theme.accent, borderColor: theme.accent },
  actionText: { color: theme.text, fontSize: theme.font.small, fontWeight: "600" },
  runText: { color: theme.onAccent },
  empty: { color: theme.muted, textAlign: "center", marginTop: 40 },
  error: { color: theme.error, padding: theme.spacing(4) },
});
