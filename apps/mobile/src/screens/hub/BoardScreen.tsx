import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@hermes-mobile/ui";
import { type BoardLane, type BoardTask, useHub } from "../../store";

const LANES: { key: BoardLane; label: string; color: string }[] = [
  { key: "queue", label: "QUEUE", color: theme.muted },
  { key: "active", label: "ACTIVE", color: theme.accent },
  { key: "shipped", label: "SHIPPED", color: theme.success },
];

function age(createdAt: number): string {
  const days = Math.floor((Date.now() - createdAt) / 86_400_000);
  return days <= 0 ? "NEW" : `${days}D`;
}

/** Offline-first operations board. Cards are editable and lane moves persist locally. */
export function BoardScreen() {
  const board = useHub((s) => s.board);
  const add = useHub((s) => s.addBoardTask);
  const edit = useHub((s) => s.editBoardTask);
  const move = useHub((s) => s.moveBoardTask);
  const remove = useHub((s) => s.removeBoardTask);
  const [newTitle, setNewTitle] = useState("");
  const [selected, setSelected] = useState<BoardTask | null>(null);
  const [draft, setDraft] = useState("");
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timeout = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timeout);
  }, [armed]);

  const create = () => {
    if (!newTitle.trim()) return;
    add(newTitle);
    setNewTitle("");
  };
  const open = (task: BoardTask) => {
    setSelected(task);
    setDraft(task.title);
    setArmed(false);
  };
  const save = () => {
    if (!selected) return;
    const next = draft.trim();
    // Edit in place — keeps the task's id, lane, and age intact.
    if (next && next !== selected.title) edit(selected.id, next);
    setSelected(null);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View><Text style={styles.title}>OPS BOARD</Text><Text style={styles.meta}>{board.length} TASKS · TAP TO EDIT</Text></View>
        <Ionicons name="git-network-outline" size={21} color={theme.accent} />
      </View>
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          value={newTitle}
          onChangeText={setNewTitle}
          placeholder="Add an operation…"
          placeholderTextColor={theme.muted}
          onSubmitEditing={create}
          returnKeyType="done"
          testID="board-add-input"
        />
        <Pressable style={[styles.addButton, !newTitle.trim() && styles.disabled]} onPress={create} disabled={!newTitle.trim()} testID="board-add">
          <Ionicons name="add" size={21} color={theme.onAccent} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.columns}>
        {LANES.map((lane) => {
          const tasks = board.filter((task) => task.lane === lane.key);
          return (
            <View key={lane.key} style={styles.column}>
              <View style={styles.columnHead}>
                <Text style={[styles.columnLabel, { color: lane.color }]}>{lane.label}</Text>
                <Text style={[styles.columnCount, { color: lane.color }]}>{String(tasks.length).padStart(2, "0")}</Text>
              </View>
              <ScrollView contentContainerStyle={styles.cards} nestedScrollEnabled>
                {tasks.length === 0 && <View style={styles.drop}><Text style={styles.dropText}>DROP HERE</Text></View>}
                {tasks.map((task) => (
                  <Pressable key={task.id} style={styles.card} onPress={() => open(task)} testID={`board-task-${task.id}`}>
                    <View style={styles.cardMeta}><Text style={styles.taskId}>{task.id}</Text><Text style={styles.taskAge}>{age(task.createdAt)}</Text></View>
                    <Text style={styles.taskTitle}>{task.title}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}><Text style={styles.sheetTitle}>{selected?.id} // EDIT</Text><Pressable style={styles.close} onPress={() => setSelected(null)}><Ionicons name="close" size={19} color={theme.muted} /></Pressable></View>
            <TextInput style={styles.editor} value={draft} onChangeText={setDraft} multiline autoFocus textAlignVertical="top" />
            <Text style={styles.moveTitle}>MOVE TO</Text>
            <View style={styles.moveRow}>
              {LANES.map((lane) => (
                <Pressable
                  key={lane.key}
                  style={[styles.moveChip, selected?.lane === lane.key && { borderColor: lane.color, backgroundColor: theme.surfaceHigh }]}
                  onPress={() => selected && (move(selected.id, lane.key), setSelected({ ...selected, lane: lane.key }))}
                >
                  <Text style={[styles.moveText, selected?.lane === lane.key && { color: lane.color }]}>{lane.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.sheetActions}>
              <Pressable
                style={[styles.delete, armed && styles.deleteArmed]}
                onPress={() => {
                  if (!selected) return;
                  if (armed) { remove(selected.id); setSelected(null); }
                  else setArmed(true);
                }}
              >
                <Text style={styles.deleteText}>{armed ? "CONFIRM — TAP AGAIN" : "PURGE"}</Text>
              </Pressable>
              <Pressable style={styles.done} onPress={save}><Text style={styles.doneText}>DONE</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  head: { minHeight: 72, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.spacing(4), borderBottomWidth: 1, borderBottomColor: theme.border },
  title: { color: theme.text, fontFamily: theme.display, fontSize: 22, letterSpacing: 1 },
  meta: { color: theme.muted, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.5, marginTop: 4 },
  addRow: { flexDirection: "row", gap: theme.spacing(2), padding: theme.spacing(3), borderBottomWidth: 1, borderBottomColor: theme.border },
  addInput: { flex: 1, minHeight: 44, color: theme.text, borderWidth: 1, borderStyle: "dashed", borderColor: theme.border, paddingHorizontal: theme.spacing(3), fontSize: 14 },
  addButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: theme.accentDim, borderTopRightRadius: 10 },
  disabled: { opacity: 0.42 },
  columns: { paddingHorizontal: theme.spacing(3), paddingTop: theme.spacing(3), gap: theme.spacing(3), flexGrow: 1 },
  column: { width: 280, backgroundColor: theme.sidebar, borderWidth: 1, borderColor: theme.border, padding: theme.spacing(2) },
  columnHead: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.spacing(1) },
  columnLabel: { fontSize: 11, fontFamily: theme.mono, letterSpacing: 0.7 },
  columnCount: { fontSize: 11, fontFamily: theme.mono },
  cards: { gap: theme.spacing(2), paddingBottom: theme.spacing(3) },
  card: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, padding: theme.spacing(3), gap: theme.spacing(2) },
  cardMeta: { flexDirection: "row", justifyContent: "space-between" },
  taskId: { color: theme.accent, fontSize: 10, fontFamily: theme.mono },
  taskAge: { color: theme.muted, fontSize: 10, fontFamily: theme.mono },
  taskTitle: { color: theme.text, fontSize: 14, lineHeight: 20, fontFamily: theme.fontFamilyMedium },
  drop: { minHeight: 86, borderWidth: 1, borderStyle: "dashed", borderColor: theme.border, alignItems: "center", justifyContent: "center" },
  dropText: { color: theme.muted, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.6 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: theme.scrim },
  sheet: { backgroundColor: theme.sidebar, borderTopWidth: 1, borderColor: theme.border, padding: theme.spacing(4), gap: theme.spacing(3) },
  sheetHead: { minHeight: 32, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { color: theme.text, fontFamily: theme.mono, fontSize: 12, letterSpacing: 0.6 },
  close: { minHeight: 38, minWidth: 38, alignItems: "center", justifyContent: "center" },
  editor: { minHeight: 88, maxHeight: 160, color: theme.text, fontSize: 16, lineHeight: 23, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, padding: theme.spacing(3) },
  moveTitle: { color: theme.muted, fontSize: 10, fontFamily: theme.mono, letterSpacing: 0.6 },
  moveRow: { flexDirection: "row", gap: theme.spacing(2) },
  moveChip: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border },
  moveText: { color: theme.muted, fontFamily: theme.mono, fontSize: 10 },
  sheetActions: { flexDirection: "row", justifyContent: "space-between", gap: theme.spacing(3), marginTop: theme.spacing(1) },
  delete: { minHeight: 44, paddingHorizontal: theme.spacing(3), justifyContent: "center", borderWidth: 1, borderColor: theme.border },
  deleteArmed: { backgroundColor: theme.error, borderColor: theme.error },
  deleteText: { color: theme.error, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.4 },
  done: { minHeight: 44, minWidth: 98, alignItems: "center", justifyContent: "center", backgroundColor: theme.accentDim, borderTopRightRadius: 10 },
  doneText: { color: theme.onAccent, fontFamily: theme.mono, fontSize: 11, letterSpacing: 0.5 },
});
