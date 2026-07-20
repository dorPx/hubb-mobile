import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ProviderInfo } from "@hermes-mobile/api-client";
import { theme } from "@hermes-mobile/ui";
import { gateway } from "../client";
import { useApp } from "../store";
import { TabBar } from "../components/TabBar";

/** Provider API keys (OpenRouter, Nous Portal, and everything Hermes supports)
 * — stored on the Hermes host via its own key vault, never on the phone. */
export function SettingsScreen() {
  const qc = useQueryClient();
  const creds = useApp((s) => s.credentials);
  const setCredentials = useApp((s) => s.setCredentials);
  const [open, setOpen] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["providers"],
    queryFn: () => gateway().providers(),
    staleTime: 5 * 60_000, // upstream probes every provider; don't hammer it
  });

  const saveKey = useMutation({
    mutationFn: ({ id, key }: { id: string; key: string | null }) =>
      gateway().setProviderKey(id, key),
    onSuccess: () => {
      setOpen(null);
      setKeyDraft("");
      void qc.invalidateQueries({ queryKey: ["providers"] });
    },
  });

  const sorted = [...(data ?? [])].sort(
    (a, b) => Number(b.hasKey) - Number(a.hasKey) || a.name.localeCompare(b.name),
  );

  const renderProvider = ({ item }: { item: ProviderInfo }) => {
    const expanded = open === item.id;
    return (
      <View style={styles.row} testID={`provider-${item.id}`}>
        <Pressable
          style={styles.rowHead}
          onPress={() => {
            setOpen(expanded ? null : item.id);
            setKeyDraft("");
          }}
        >
          <View style={[styles.dot, { backgroundColor: item.hasKey ? theme.success : theme.border }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {item.hasKey
                ? `connected · ${item.keySource ?? "key"} · ${item.modelCount} models`
                : item.authError
                  ? item.authError
                  : "no key"}
            </Text>
          </View>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={theme.muted} />
        </Pressable>
        {expanded &&
          (item.keySource === "oauth" ? (
            <Text style={styles.oauthHint}>
              {item.name} signs in with OAuth — run `hermes` on the host (or the desktop WebUI) to
              connect it. Keys pasted here would be ignored.
            </Text>
          ) : (
            <View style={styles.keyRow}>
              <TextInput
                style={styles.keyInput}
                value={keyDraft}
                onChangeText={setKeyDraft}
                placeholder={item.hasKey ? "paste a new API key…" : "paste API key…"}
                placeholderTextColor={theme.muted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                testID={`key-${item.id}`}
              />
              <Pressable
                style={[styles.keyBtn, !keyDraft.trim() && styles.keyBtnDisabled]}
                disabled={!keyDraft.trim() || saveKey.isPending}
                onPress={() => saveKey.mutate({ id: item.id, key: keyDraft.trim() })}
                testID={`key-save-${item.id}`}
              >
                <Text style={styles.keyBtnText}>Save</Text>
              </Pressable>
              {item.hasKey && (
                <Pressable
                  style={styles.keyClear}
                  disabled={saveKey.isPending}
                  onPress={() => saveKey.mutate({ id: item.id, key: null })}
                >
                  <Text style={styles.keyClearText}>Remove</Text>
                </Pressable>
              )}
            </View>
          ))}
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>
      <FlatList
        data={sorted}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <>
            <Text style={styles.section}>Gateway</Text>
            <View style={styles.card}>
              <Text style={styles.name}>{creds?.gatewayUrl ?? "—"}</Text>
              <Text style={styles.meta}>Paired Hermes host</Text>
              <Pressable style={styles.unpair} onPress={() => setCredentials(null)} testID="unpair">
                <Text style={styles.unpairText}>Unpair this device</Text>
              </Pressable>
            </View>
            <Text style={styles.section}>Provider API keys</Text>
            <Text style={styles.hint}>
              Keys are saved into your Hermes host’s own configuration — the same vault its setup
              wizard uses — and never stored on this phone.
            </Text>
            {isLoading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.accent} />
                <Text style={styles.meta}> probing providers on the host (can take up to a minute)…</Text>
              </View>
            )}
            {!!error && <Text style={styles.error}>{(error as Error).message}</Text>}
            {!!saveKey.error && <Text style={styles.error}>{(saveKey.error as Error).message}</Text>}
          </>
        }
        renderItem={renderProvider}
      />
      <TabBar active="settings" />
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
  title: { color: theme.text, fontSize: 20, fontWeight: "700", fontFamily: theme.fontFamily },
  section: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: theme.spacing(4),
    paddingTop: theme.spacing(4),
    paddingBottom: theme.spacing(1),
  },
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    marginHorizontal: theme.spacing(3),
    padding: theme.spacing(3),
    gap: 2,
  },
  hint: {
    color: theme.muted,
    fontSize: theme.font.small,
    lineHeight: 17,
    paddingHorizontal: theme.spacing(4),
    paddingBottom: theme.spacing(2),
  },
  loadingRow: { flexDirection: "row", alignItems: "center", padding: theme.spacing(4) },
  row: { borderBottomWidth: 1, borderBottomColor: theme.border },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing(3),
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(3),
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  name: { color: theme.text, fontSize: theme.font.body, fontWeight: "600", fontFamily: theme.fontFamily },
  meta: { color: theme.muted, fontSize: theme.font.small, marginTop: 1 },
  oauthHint: {
    color: theme.muted,
    fontSize: theme.font.small,
    lineHeight: 17,
    paddingHorizontal: theme.spacing(4),
    paddingBottom: theme.spacing(3),
  },
  keyRow: {
    flexDirection: "row",
    gap: theme.spacing(2),
    paddingHorizontal: theme.spacing(4),
    paddingBottom: theme.spacing(3),
    alignItems: "center",
  },
  keyInput: {
    flex: 1,
    color: theme.text,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(2),
    fontSize: theme.font.small,
  },
  keyBtn: {
    backgroundColor: theme.accent,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(2),
  },
  keyBtnDisabled: { opacity: 0.45 },
  keyBtnText: { color: theme.onAccent, fontWeight: "700", fontSize: theme.font.small },
  keyClear: { paddingHorizontal: theme.spacing(1) },
  keyClearText: { color: theme.error, fontSize: theme.font.small, fontWeight: "600" },
  unpair: { marginTop: theme.spacing(2) },
  unpairText: { color: theme.error, fontSize: theme.font.small, fontWeight: "600" },
  error: { color: theme.error, paddingHorizontal: theme.spacing(4), paddingBottom: theme.spacing(2) },
});
