import { useQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@hermes-mobile/ui";
import { gateway } from "../client";
import { useApp } from "../store";
import { TabBar } from "../components/TabBar";

function fmtSize(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Workspace file browser (gateway-mediated; reference-app parity). */
export function FilesScreen({ path }: { path?: string }) {
  const navigate = useApp((s) => s.navigate);

  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => gateway().workspaces(),
    enabled: !path,
  });
  const dir = useQuery({
    queryKey: ["dir", path],
    queryFn: () => gateway().listDir(path as string),
    enabled: !!path,
  });

  const parent = path && path.includes("/") ? path.slice(0, path.lastIndexOf("/")) || "/" : null;
  const atRoot = !path;
  const isWorkspaceRoot = !!path && (workspaces.data ?? []).some((w) => w.path === path);
  const loading = atRoot ? workspaces.isLoading : dir.isLoading;
  const error = (atRoot ? workspaces.error : dir.error) as Error | null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        {!atRoot && (
          <Pressable
            onPress={() => navigate(isWorkspaceRoot ? { name: "files" } : { name: "files", path: parent ?? undefined })}
            style={styles.back}
            testID="files-back"
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>
        )}
        <Text style={styles.title} numberOfLines={1}>
          {atRoot ? "Files" : (path ?? "").split("/").pop() || path}
        </Text>
      </View>
      {loading && <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />}
      {!!error && <Text style={styles.error}>{error.message}</Text>}
      {atRoot ? (
        <FlatList
          data={workspaces.data ?? []}
          keyExtractor={(w) => w.path}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => navigate({ name: "files", path: item.path })}>
              <Ionicons name="albums-outline" size={20} color={theme.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {item.path}
                </Text>
              </View>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={(dir.data ?? []).filter((e) => !e.name.startsWith("."))}
          keyExtractor={(e) => e.path}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() =>
                item.type === "dir"
                  ? navigate({ name: "files", path: item.path })
                  : navigate({ name: "file", path: item.path })
              }
              testID={`entry-${item.name}`}
            >
              <Ionicons
                name={item.type === "dir" ? "folder" : "document-text-outline"}
                size={20}
                color={item.type === "dir" ? theme.accent : theme.muted}
              />
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rowSub}>{fmtSize(item.size)}</Text>
            </Pressable>
          )}
        />
      )}
      <TabBar active="files" />
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
  title: { color: theme.text, fontSize: 20, fontWeight: "700", flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: theme.spacing(3),
  },
  rowTitle: { color: theme.text, fontSize: theme.font.body, flex: 1 },
  rowSub: { color: theme.muted, fontSize: theme.font.small },
  error: { color: theme.error, padding: theme.spacing(4) },
});
