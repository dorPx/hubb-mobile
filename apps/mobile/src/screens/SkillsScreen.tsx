import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { theme } from "@hermes-mobile/ui";
import { gateway } from "../client";
import { TabBar } from "../components/TabBar";

/** Skills/tools registry — see and toggle available skills. */
export function SkillsScreen() {
  const qc = useQueryClient();
  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["skills"],
    queryFn: () => gateway().skills(),
  });

  const toggle = useMutation({
    mutationFn: ({ name, disabled }: { name: string; disabled: boolean }) =>
      gateway().toggleSkill(name, disabled),
    onSettled: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Skills</Text>
        <Text style={styles.count}>{data ? `${data.filter((s) => !s.disabled).length}/${data.length} on` : ""}</Text>
      </View>
      {isLoading && <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />}
      {!!error && <Text style={styles.error}>{(error as Error).message}</Text>}
      <FlatList
        data={data ?? []}
        keyExtractor={(s) => s.name}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={theme.accent} />
        }
        renderItem={({ item }) => (
          <View style={styles.row} testID={`skill-${item.name}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.desc} numberOfLines={2}>
                {item.description.replace(/\s+/g, " ")}
              </Text>
            </View>
            <Switch
              value={!item.disabled}
              onValueChange={(on) => toggle.mutate({ name: item.name, disabled: !on })}
              trackColor={{ true: theme.accent, false: theme.border }}
              thumbColor={theme.text}
              testID={`skill-${item.name}-switch`}
            />
          </View>
        )}
      />
      <TabBar active="skills" />
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
  count: { color: theme.muted, fontSize: theme.font.small },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: theme.spacing(3),
  },
  name: { color: theme.text, fontSize: theme.font.body, fontWeight: "600" },
  desc: { color: theme.muted, fontSize: theme.font.small, marginTop: 2, lineHeight: 17 },
  error: { color: theme.error, padding: theme.spacing(4) },
});
