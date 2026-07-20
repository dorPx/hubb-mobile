import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { theme } from "@hermes-mobile/ui";
import { gateway } from "../client";
import { TabBar } from "../components/TabBar";

/** "What am I?" — edits the Hermes host's SOUL.md, the agent's core persona. */
export function ProfileScreen() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["soul"],
    queryFn: () => gateway().getSoul(),
  });
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    if (data && draft === null) setDraft(data.soul);
  }, [data, draft]);

  const save = useMutation({
    mutationFn: (content: string) => gateway().saveSoul(content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["soul"] }),
  });
  const dirty = data != null && draft !== null && draft !== data.soul;

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>What am I?</Text>
          <Text style={styles.sub}>Describe your AI’s soul</Text>
        </View>
        <Pressable
          style={[styles.saveBtn, (!dirty || save.isPending) && styles.saveBtnDisabled]}
          disabled={!dirty || save.isPending}
          onPress={() => draft !== null && save.mutate(draft)}
          testID="soul-save"
        >
          <Text style={styles.saveText}>{save.isPending ? "Saving…" : dirty ? "Save" : "Saved"}</Text>
        </Pressable>
      </View>
      {isLoading && <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />}
      {!!error && <Text style={styles.error}>{(error as Error).message}</Text>}
      {!!save.error && <Text style={styles.error}>{(save.error as Error).message}</Text>}
      {data != null && (
        <>
          <TextInput
            style={styles.editor}
            multiline
            value={draft ?? ""}
            onChangeText={setDraft}
            placeholder={
              "I am Hermes — direct, curious, loyal to my operator.\n\nWrite the persona, values, and voice your agent should carry into every session…"
            }
            placeholderTextColor={theme.muted}
            textAlignVertical="top"
            testID="soul-editor"
          />
          <Text style={styles.path} numberOfLines={1}>
            {data.path} — applies to every session on this Hermes host.
          </Text>
        </>
      )}
      <TabBar active="profile" />
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
  title: { color: theme.text, fontSize: 20, fontWeight: "700", fontFamily: theme.fontFamily },
  sub: { color: theme.muted, fontSize: theme.font.small, marginTop: 2, fontFamily: theme.fontFamily },
  saveBtn: {
    backgroundColor: theme.accent,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(2),
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveText: { color: theme.onAccent, fontWeight: "700", fontSize: theme.font.small },
  editor: {
    flex: 1,
    color: theme.text,
    fontSize: theme.font.body,
    lineHeight: 22,
    padding: theme.spacing(4),
    fontFamily: theme.fontFamily,
  },
  path: {
    color: theme.muted,
    fontSize: 11,
    paddingHorizontal: theme.spacing(4),
    paddingBottom: theme.spacing(2),
  },
  error: { color: theme.error, padding: theme.spacing(4) },
});
