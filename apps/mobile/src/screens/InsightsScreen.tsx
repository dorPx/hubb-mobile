import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "@hermes-mobile/ui";
import { gateway } from "../client";
import { TabBar } from "../components/TabBar";

function Stat({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.stat} testID={testID}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Usage analytics + system insights (gateway health, skills usage). */
export function InsightsScreen() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["insights"],
    queryFn: () => gateway().insights(),
    refetchInterval: 30_000,
  });

  const health = (data?.health ?? {}) as {
    cpu?: { percent?: number };
    memory?: { used_bytes?: number; total_bytes?: number };
    status?: string;
  };
  const memPct =
    health.memory?.used_bytes && health.memory?.total_bytes
      ? Math.round((health.memory.used_bytes / health.memory.total_bytes) * 100)
      : null;
  const topSkills = [...(data?.skillsUsage ?? [])].sort((a, b) => b.uses - a.uses).slice(0, 8);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Insights</Text>
        <View style={[styles.dot, { backgroundColor: data?.upstreamReachable ? theme.success : theme.error }]} />
      </View>
      {isLoading && <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />}
      {!!error && <Text style={styles.error}>{(error as Error).message}</Text>}
      {!!data && (
        <ScrollView contentContainerStyle={{ padding: theme.spacing(3), gap: theme.spacing(3) }}>
          <View style={styles.statRow}>
            <Stat
              label="Agent host"
              value={data.upstreamReachable ? "ONLINE" : "DOWN"}
              testID="stat-upstream"
            />
            <Stat label="Sessions" value={String(data.sessionCount ?? "—")} testID="stat-sessions" />
            <Stat label="Live streams" value={String(data.activeStreams)} testID="stat-streams" />
          </View>
          <View style={styles.statRow}>
            <Stat label="Host CPU" value={health.cpu?.percent != null ? `${health.cpu.percent}%` : "—"} />
            <Stat label="Host memory" value={memPct != null ? `${memPct}%` : "—"} />
            <Stat label="Host status" value={(health.status ?? "—").toUpperCase()} />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Most-used skills</Text>
            {topSkills.length === 0 && <Text style={styles.empty}>No skill usage recorded yet.</Text>}
            {topSkills.map((s) => (
              <View key={s.name} style={styles.skillRow}>
                <Text style={styles.skillName} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text style={styles.skillUses}>{s.uses}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
      <TabBar active="insights" />
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
  dot: { width: 10, height: 10, borderRadius: 5 },
  statRow: { flexDirection: "row", gap: theme.spacing(3) },
  stat: {
    flex: 1,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing(3),
    alignItems: "center",
  },
  statValue: { color: theme.text, fontSize: 17, fontWeight: "700" },
  statLabel: { color: theme.muted, fontSize: 11, marginTop: 4, textAlign: "center" },
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing(3),
  },
  cardTitle: { color: theme.text, fontWeight: "700", marginBottom: theme.spacing(2) },
  skillRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: theme.spacing(1.5),
    borderTopWidth: 1,
    borderTopColor: theme.border,
    gap: theme.spacing(2),
  },
  skillName: { color: theme.text, fontSize: theme.font.small, flex: 1 },
  skillUses: { color: theme.accent, fontSize: theme.font.small, fontWeight: "700" },
  empty: { color: theme.muted, fontSize: theme.font.small },
  error: { color: theme.error, padding: theme.spacing(4) },
});
