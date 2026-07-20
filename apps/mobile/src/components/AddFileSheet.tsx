import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { theme } from "@hermes-mobile/ui";
import { gateway } from "../client";

/** Add a file to the current workspace directory so Hermes can read it —
 * pick a text file from the device, or type one inline. */
export function AddFileSheet({ dir, onClose }: { dir: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [picking, setPicking] = useState(false);

  const save = useMutation({
    mutationFn: () => gateway().createFile(dir, name.trim(), content),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dir", dir] });
      onClose();
    },
  });

  const pick = async () => {
    setPicking(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: "*/*" });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      let text = "";
      if (Platform.OS === "web") {
        text = await (await fetch(asset.uri)).text();
      } else {
        text = await FileSystem.readAsStringAsync(asset.uri);
      }
      if (!name) setName(asset.name || "upload.txt");
      setContent(text);
    } catch (e) {
      setContent(`could not read file: ${String((e as Error).message || e)}`);
    } finally {
      setPicking(false);
    }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <KeyboardAvoidingView
        style={styles.sheetWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.sheet}>
          <Text style={styles.title}>Add file to workspace</Text>
          <Text style={styles.dir} numberOfLines={1}>
            {dir}
          </Text>
          <Pressable style={styles.pickBtn} onPress={pick} disabled={picking} testID="file-pick">
            <Text style={styles.pickText}>{picking ? "Reading…" : "Pick a file from device"}</Text>
          </Pressable>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="file name (e.g. notes.md)"
            placeholderTextColor={theme.muted}
            autoCapitalize="none"
            autoCorrect={false}
            testID="file-name"
          />
          <TextInput
            style={styles.contentInput}
            value={content}
            onChangeText={setContent}
            placeholder="…or type / paste the contents here"
            placeholderTextColor={theme.muted}
            multiline
            textAlignVertical="top"
            testID="file-content"
          />
          {!!save.error && <Text style={styles.err}>{(save.error as Error).message}</Text>}
          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.save, (!name.trim() || save.isPending) && styles.saveDisabled]}
              disabled={!name.trim() || save.isPending}
              onPress={() => save.mutate()}
              testID="file-save"
            >
              {save.isPending ? (
                <ActivityIndicator color={theme.onAccent} size="small" />
              ) : (
                <Text style={styles.saveText}>Add file</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: theme.scrim },
  sheetWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: theme.sidebar,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    borderTopWidth: 1,
    borderColor: theme.border,
    padding: theme.spacing(4),
    gap: theme.spacing(3),
  },
  title: { color: theme.text, fontSize: 17, fontWeight: "700", fontFamily: theme.fontFamily },
  dir: { color: theme.muted, fontSize: theme.font.small, marginTop: -theme.spacing(2) },
  pickBtn: {
    borderWidth: 1,
    borderColor: theme.accent,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2.5),
    alignItems: "center",
  },
  pickText: { color: theme.accent, fontWeight: "600", fontSize: theme.font.body },
  nameInput: {
    color: theme.text,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(2.5),
    fontSize: theme.font.body,
  },
  contentInput: {
    color: theme.text,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    padding: theme.spacing(3),
    fontSize: theme.font.small,
    fontFamily: "monospace" as const,
    minHeight: 120,
    maxHeight: 220,
  },
  err: { color: theme.error, fontSize: theme.font.small },
  actions: { flexDirection: "row", gap: theme.spacing(3), justifyContent: "flex-end" },
  cancel: { paddingHorizontal: theme.spacing(4), paddingVertical: theme.spacing(2.5) },
  cancelText: { color: theme.muted, fontWeight: "600" },
  save: {
    backgroundColor: theme.accent,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(5),
    paddingVertical: theme.spacing(2.5),
    minWidth: 96,
    alignItems: "center",
  },
  saveDisabled: { opacity: 0.45 },
  saveText: { color: theme.onAccent, fontWeight: "700" },
});
