import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { theme } from "@hermes-mobile/ui";
import { gateway } from "../client";

type Freq = "hourly" | "daily" | "weekly";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Cron expression from the simple builder. */
function toCron(freq: Freq, hour: number, minute: number, dow: number): string {
  if (freq === "hourly") return `${minute} * * * *`;
  if (freq === "weekly") return `${minute} ${hour} * * ${dow}`;
  return `${minute} ${hour} * * *`; // daily
}

function humanize(freq: Freq, hour: number, minute: number, dow: number): string {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  if (freq === "hourly") return `every hour at :${mm}`;
  if (freq === "weekly") return `every ${DAYS[dow]} at ${hh}:${mm}`;
  return `every day at ${hh}:${mm}`;
}

/** Create a scheduled task — a prompt Hermes runs on a schedule (cowork-style). */
export function AddTaskSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [freq, setFreq] = useState<Freq>("daily");
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [dow, setDow] = useState(1);

  const create = useMutation({
    mutationFn: () =>
      gateway().createTask({
        name: name.trim(),
        prompt: prompt.trim(),
        schedule: toCron(freq, hour, minute, dow),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    },
  });

  const step = (setter: (fn: (n: number) => number) => void, delta: number, max: number) =>
    setter((n) => (n + delta + max) % max);

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <KeyboardAvoidingView style={styles.sheetWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.sheet}>
          <Text style={styles.title}>New scheduled task</Text>
          <Text style={styles.subtitle}>A prompt Hermes runs on a schedule — like a Cowork job.</Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="task name (optional)"
              placeholderTextColor={theme.muted}
              testID="task-name"
            />
            <TextInput
              style={[styles.input, styles.prompt]}
              value={prompt}
              onChangeText={setPrompt}
              placeholder="what should Hermes do each run? e.g. Summarize my unread email and post the digest."
              placeholderTextColor={theme.muted}
              multiline
              textAlignVertical="top"
              testID="task-prompt"
            />
            <Text style={styles.label}>Frequency</Text>
            <View style={styles.seg}>
              {(["hourly", "daily", "weekly"] as Freq[]).map((f) => (
                <Pressable
                  key={f}
                  style={[styles.segBtn, freq === f && styles.segBtnActive]}
                  onPress={() => setFreq(f)}
                  testID={`freq-${f}`}
                >
                  <Text style={[styles.segText, freq === f && styles.segTextActive]}>{f.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
            {freq === "weekly" && (
              <View style={styles.days}>
                {DAYS.map((d, i) => (
                  <Pressable
                    key={d}
                    style={[styles.day, dow === i && styles.dayActive]}
                    onPress={() => setDow(i)}
                  >
                    <Text style={[styles.dayText, dow === i && styles.dayTextActive]}>{d}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={styles.timeRow}>
              {freq !== "hourly" && (
                <Stepper label="Hour" value={String(hour).padStart(2, "0")} onDown={() => step(setHour, -1, 24)} onUp={() => step(setHour, 1, 24)} />
              )}
              <Stepper label="Minute" value={String(minute).padStart(2, "0")} onDown={() => step(setMinute, -5 + 60, 60)} onUp={() => step(setMinute, 5, 60)} />
            </View>
            <Text style={styles.preview}>Runs {humanize(freq, hour, minute, dow)}</Text>
            {!!create.error && <Text style={styles.err}>{(create.error as Error).message}</Text>}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.save, (!prompt.trim() || create.isPending) && styles.saveDisabled]}
              disabled={!prompt.trim() || create.isPending}
              onPress={() => create.mutate()}
              testID="task-create"
            >
              {create.isPending ? (
                <ActivityIndicator color={theme.onAccent} size="small" />
              ) : (
                <Text style={styles.saveText}>Create task</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Stepper({ label, value, onDown, onUp }: { label: string; value: string; onDown: () => void; onUp: () => void }) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepControls}>
        <Pressable style={styles.stepBtn} onPress={onDown}>
          <Text style={styles.stepBtnText}>–</Text>
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable style={styles.stepBtn} onPress={onUp}>
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
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
    maxHeight: "88%",
    gap: theme.spacing(2),
  },
  title: { color: theme.text, fontSize: 17, fontWeight: "700", fontFamily: theme.fontFamily },
  subtitle: { color: theme.muted, fontSize: theme.font.small, marginBottom: theme.spacing(1) },
  input: {
    color: theme.text,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(2.5),
    fontSize: theme.font.body,
    marginBottom: theme.spacing(2),
  },
  prompt: { minHeight: 90, fontSize: theme.font.small, lineHeight: 20 },
  label: { color: theme.muted, fontSize: 11, fontWeight: "700", marginBottom: theme.spacing(1) },
  seg: { flexDirection: "row", gap: theme.spacing(2), marginBottom: theme.spacing(3) },
  segBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2),
    alignItems: "center",
  },
  segBtnActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  segText: { color: theme.muted, fontSize: theme.font.small, fontWeight: "700" },
  segTextActive: { color: theme.onAccent },
  days: { flexDirection: "row", gap: theme.spacing(1), marginBottom: theme.spacing(3) },
  day: { flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.sm, paddingVertical: theme.spacing(1.5), alignItems: "center" },
  dayActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  dayText: { color: theme.muted, fontSize: 11, fontWeight: "600" },
  dayTextActive: { color: theme.onAccent },
  timeRow: { flexDirection: "row", gap: theme.spacing(3), marginBottom: theme.spacing(2) },
  stepper: { flex: 1, gap: theme.spacing(1) },
  stepLabel: { color: theme.muted, fontSize: 11, fontWeight: "700" },
  stepControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
  },
  stepBtn: { paddingHorizontal: theme.spacing(4), paddingVertical: theme.spacing(2) },
  stepBtnText: { color: theme.accent, fontSize: 20, fontWeight: "700" },
  stepValue: { color: theme.text, fontSize: 18, fontWeight: "700", fontFamily: "monospace" as const },
  preview: { color: theme.accent, fontSize: theme.font.small, fontWeight: "600", marginBottom: theme.spacing(2) },
  err: { color: theme.error, fontSize: theme.font.small, marginBottom: theme.spacing(2) },
  actions: { flexDirection: "row", gap: theme.spacing(3), justifyContent: "flex-end", paddingTop: theme.spacing(1) },
  cancel: { paddingHorizontal: theme.spacing(4), paddingVertical: theme.spacing(2.5) },
  cancelText: { color: theme.muted, fontWeight: "600" },
  save: {
    backgroundColor: theme.accent,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(5),
    paddingVertical: theme.spacing(2.5),
    minWidth: 120,
    alignItems: "center",
  },
  saveDisabled: { opacity: 0.45 },
  saveText: { color: theme.onAccent, fontWeight: "700" },
});
