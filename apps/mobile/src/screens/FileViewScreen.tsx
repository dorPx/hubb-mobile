import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "@hermes-mobile/ui";
import { gateway } from "../client";
import { useApp } from "../store";

/** Read-only file viewer (monospace; syntax highlighting is a later pass). */
export function FileViewScreen({ path }: { path: string }) {
  const navigate = useApp((s) => s.navigate);
  const { data, isLoading, error } = useQuery({
    queryKey: ["file", path],
    queryFn: () => gateway().readFile(path),
  });
  const parent = path.slice(0, path.lastIndexOf("/")) || "/";

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigate({ name: "files", path: parent })} style={styles.back} testID="file-back">
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {path.split("/").pop()}
        </Text>
      </View>
      {isLoading && <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />}
      {!!error && <Text style={styles.error}>{(error as Error).message}</Text>}
      {!!data && (
        <ScrollView style={styles.body} contentContainerStyle={{ padding: theme.spacing(3) }}>
          <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
            <Text style={styles.code} testID="file-content">
              {data.content || "(empty file)"}
            </Text>
          </ScrollView>
          {data.truncated && <Text style={styles.truncated}>— truncated —</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing(4),
    gap: theme.spacing(2),
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.sidebar,
  },
  back: { paddingHorizontal: theme.spacing(1) },
  backText: { color: theme.text, fontSize: 26, lineHeight: 26 },
  title: { color: theme.text, fontSize: 17, fontWeight: "700", flex: 1 },
  body: { flex: 1 },
  code: {
    color: theme.text,
    fontFamily: "monospace" as const,
    fontSize: 12.5,
    lineHeight: 19,
  },
  truncated: { color: theme.muted, marginTop: theme.spacing(3), fontStyle: "italic" },
  error: { color: theme.error, padding: theme.spacing(4) },
});
