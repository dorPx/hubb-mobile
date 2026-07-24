import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@hermes-mobile/ui";
import { type HubModuleId, useApp, useHub } from "../../store";

const MODULES: { id: HubModuleId; name: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "memory", name: "MEMORY BANK", desc: "Long-term operator notes — persist across sessions, readable by the fleet.", icon: "server-outline" },
  { id: "timer", name: "OPS TIMER", desc: "Mission clock — count up on any task and log the elapsed time.", icon: "timer-outline" },
  { id: "ping", name: "FLEET PING", desc: "One-tap reachability check against the paired gateway endpoint.", icon: "pulse-outline" },
];

/** MODS bay — install / eject the HUBB plugin modules; each carries a live mini-UI. */
export function ModulesScreen() {
  const installed = useHub((s) => s.installedModules);
  const toggle = useHub((s) => s.toggleModule);
  const navigate = useApp((s) => s.navigate);
  const [open, setOpen] = useState<HubModuleId | null>("memory");
  const [armed, setArmed] = useState<HubModuleId | null>(null);

  useEffect(() => {
    if (!armed) return;
    const timeout = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(timeout);
  }, [armed]);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View>
          <Text style={styles.title}>MODULE BAY</Text>
          <Text style={styles.meta}>{installed.length}/{MODULES.length} INSTALLED · TAP TO EXPAND</Text>
        </View>
        <Ionicons name="apps-outline" size={21} color={theme.accent} />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {MODULES.map((mod) => {
          const isInstalled = installed.includes(mod.id);
          const expanded = isInstalled && open === mod.id;
          return (
            <View key={mod.id} style={[styles.card, isInstalled && styles.cardInstalled]}>
              <Pressable
                style={styles.cardHead}
                onPress={() => (isInstalled ? setOpen(expanded ? null : mod.id) : undefined)}
                accessibilityRole="button"
                testID={`mod-head-${mod.id}`}
              >
                <View style={[styles.modDot, { backgroundColor: isInstalled ? theme.success : theme.border }]} />
                <Ionicons name={mod.icon} size={18} color={isInstalled ? theme.accent : theme.muted} />
                <View style={styles.cardHeadText}>
                  <Text style={[styles.modName, !isInstalled && { color: theme.muted }]}>{mod.name}</Text>
                  <Text style={styles.modState}>{isInstalled ? "● INSTALLED" : "○ AVAILABLE"}</Text>
                </View>
                {isInstalled && <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={17} color={theme.muted} />}
              </Pressable>

              {!expanded && <Text style={styles.modDesc}>{mod.desc}</Text>}

              {expanded && (
                <View style={styles.body}>
                  {mod.id === "memory" && <MemoryBank />}
                  {mod.id === "timer" && <OpsTimer />}
                  {mod.id === "ping" && <FleetPing />}
                  <Pressable
                    style={[styles.eject, armed === mod.id && styles.ejectArmed]}
                    onPress={() => {
                      if (armed === mod.id) { toggle(mod.id); setArmed(null); if (open === mod.id) setOpen(null); }
                      else setArmed(mod.id);
                    }}
                    testID={`mod-eject-${mod.id}`}
                  >
                    <Text style={[styles.ejectText, armed === mod.id && styles.ejectTextArmed]}>{armed === mod.id ? "CONFIRM — TAP AGAIN" : "EJECT MODULE"}</Text>
                  </Pressable>
                </View>
              )}

              {!isInstalled && (
                <Pressable style={styles.install} onPress={() => { toggle(mod.id); setOpen(mod.id); }} testID={`mod-install-${mod.id}`}>
                  <Ionicons name="add" size={17} color={theme.accent} />
                  <Text style={styles.installText}>INSTALL MODULE</Text>
                </Pressable>
              )}
            </View>
          );
        })}

        <Pressable style={styles.footer} onPress={() => navigate({ name: "hub-settings" })}>
          <Text style={styles.footerText}>All module config — endpoints, operator identity, data — lives in the SETTINGS bay →</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/** Memory bank — standing orders persisted to the hub store. */
function MemoryBank() {
  const notes = useHub((s) => s.notes);
  const setNotes = useHub((s) => s.setHubNotes);
  return (
    <View style={styles.mini}>
      <Text style={styles.miniLabel}>STANDING ORDERS</Text>
      <TextInput
        style={styles.notes}
        value={notes}
        onChangeText={setNotes}
        placeholder="Context and things the fleet should remember…"
        placeholderTextColor={theme.muted}
        multiline
        textAlignVertical="top"
        testID="mod-memory-input"
      />
      <Text style={styles.miniHint}>{notes.trim() ? `${notes.trim().length} chars saved locally` : "Saved to this device as you type."}</Text>
    </View>
  );
}

function fmt(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/** Ops timer — a count-up mission clock. */
function OpsTimer() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const startedAt = useRef(0);
  const base = useRef(0);
  const raf = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      startedAt.current = Date.now();
      raf.current = setInterval(() => setElapsed(base.current + (Date.now() - startedAt.current)), 250);
    }
    return () => { if (raf.current) clearInterval(raf.current); };
  }, [running]);

  const toggle = () => {
    if (running) { base.current = elapsed; setRunning(false); }
    else setRunning(true);
  };
  const reset = () => { base.current = 0; setElapsed(0); setRunning(false); };

  return (
    <View style={styles.mini}>
      <Text style={styles.miniLabel}>MISSION CLOCK</Text>
      <Text style={[styles.clock, running && styles.clockRunning]}>{fmt(elapsed)}</Text>
      <View style={styles.timerRow}>
        <Pressable style={[styles.timerBtn, running && styles.timerBtnStop]} onPress={toggle} testID="mod-timer-toggle">
          <Ionicons name={running ? "pause" : "play"} size={16} color={running ? theme.warning : theme.accent} />
          <Text style={[styles.timerBtnText, { color: running ? theme.warning : theme.accent }]}>{running ? "HOLD" : elapsed ? "RESUME" : "START"}</Text>
        </Pressable>
        <Pressable style={styles.timerBtn} onPress={reset} testID="mod-timer-reset">
          <Ionicons name="refresh" size={16} color={theme.muted} />
          <Text style={[styles.timerBtnText, { color: theme.muted }]}>RESET</Text>
        </Pressable>
      </View>
    </View>
  );
}

type PingRow = { label: string; endpoint: string; status: "idle" | "pinging" | "ok" | "down" | "demo"; ms?: number };

/** Fleet ping — measured reachability of the paired gateway; other agents are demo. */
function FleetPing() {
  const credentials = useApp((s) => s.credentials);
  const navigate = useApp((s) => s.navigate);
  const initial: PingRow[] = [
    { label: "HERMES // GATEWAY", endpoint: credentials?.gatewayUrl ?? "not paired", status: credentials ? "idle" : "demo" },
    { label: "OPENAI", endpoint: "demo channel", status: "demo" },
    { label: "CLAUDE CODE", endpoint: "demo channel", status: "demo" },
  ];
  const [rows, setRows] = useState<PingRow[]>(initial);
  const [busy, setBusy] = useState(false);

  const ping = async () => {
    if (!credentials || busy) return;
    setBusy(true);
    setRows((prev) => prev.map((r) => (r.status === "demo" ? r : { ...r, status: "pinging", ms: undefined })));
    const started = Date.now();
    let status: PingRow["status"] = "down";
    let ms: number | undefined;
    try {
      // Any HTTP response (even 401/404) proves the host is reachable; we only measure round-trip.
      await fetch(credentials.gatewayUrl, { method: "GET", signal: AbortSignal.timeout(6_000) });
      ms = Date.now() - started;
      status = "ok";
    } catch {
      ms = Date.now() - started;
      status = "down";
    }
    setRows((prev) => prev.map((r) => (r.label.startsWith("HERMES") ? { ...r, status, ms } : r)));
    setBusy(false);
  };

  return (
    <View style={styles.mini}>
      <Text style={styles.miniLabel}>ENDPOINT REACHABILITY</Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.pingRow}>
          <View style={[styles.pingDot, { backgroundColor: pingColor(row.status) }]} />
          <View style={styles.pingText}>
            <Text style={styles.pingLabel}>{row.label}</Text>
            <Text style={styles.pingEndpoint} numberOfLines={1}>{row.endpoint}</Text>
          </View>
          {row.status === "pinging" ? (
            <ActivityIndicator color={theme.accent} size="small" />
          ) : (
            <Text style={[styles.pingStatus, { color: pingColor(row.status) }]}>
              {row.status === "ok" ? `${row.ms}ms` : row.status === "down" ? "UNREACHABLE" : row.status === "demo" ? "DEMO" : "READY"}
            </Text>
          )}
        </View>
      ))}
      {credentials ? (
        <Pressable style={styles.pingButton} onPress={() => void ping()} disabled={busy} testID="mod-ping-run">
          <Ionicons name="pulse" size={16} color={theme.onAccent} />
          <Text style={styles.pingButtonText}>{busy ? "PINGING…" : "PING FLEET"}</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.pingButtonGhost} onPress={() => navigate({ name: "hub-settings" })}>
          <Text style={styles.pingButtonGhostText}>PAIR A GATEWAY TO ENABLE LIVE PINGS →</Text>
        </Pressable>
      )}
    </View>
  );
}

function pingColor(status: PingRow["status"]): string {
  if (status === "ok") return theme.success;
  if (status === "down") return theme.error;
  if (status === "demo") return theme.warning;
  return theme.muted;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  head: { minHeight: 72, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.spacing(4), borderBottomWidth: 1, borderBottomColor: theme.border },
  title: { color: theme.text, fontFamily: theme.display, fontSize: 22, letterSpacing: 1 },
  meta: { color: theme.muted, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.6, marginTop: 4 },
  list: { padding: theme.spacing(3), gap: theme.spacing(3), paddingBottom: theme.spacing(6) },
  card: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, padding: theme.spacing(3), gap: theme.spacing(2) },
  cardInstalled: { borderColor: theme.borderDim },
  cardHead: { flexDirection: "row", alignItems: "center", gap: theme.spacing(2), minHeight: 40 },
  cardHeadText: { flex: 1, gap: 2 },
  modDot: { width: 8, height: 8, borderRadius: 4 },
  modName: { color: theme.text, fontFamily: theme.monoMedium, fontSize: 13, letterSpacing: 0.6 },
  modState: { color: theme.muted, fontFamily: theme.mono, fontSize: 9, letterSpacing: 0.5 },
  modDesc: { color: theme.muted, fontSize: 13, lineHeight: 19 },
  body: { gap: theme.spacing(3), marginTop: theme.spacing(1) },
  mini: { backgroundColor: theme.bgDeep, borderWidth: 1, borderColor: theme.border, padding: theme.spacing(3), gap: theme.spacing(2) },
  miniLabel: { color: theme.accent, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.7 },
  miniHint: { color: theme.muted, fontFamily: theme.mono, fontSize: 9, letterSpacing: 0.4 },
  notes: { minHeight: 96, maxHeight: 180, color: theme.text, fontSize: 14, lineHeight: 20, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, padding: theme.spacing(2) },
  clock: { color: theme.text, fontFamily: theme.mono, fontSize: 40, letterSpacing: 1, textAlign: "center", paddingVertical: theme.spacing(2) },
  clockRunning: { color: theme.accent, textShadowColor: theme.accent, textShadowRadius: 12 },
  timerRow: { flexDirection: "row", gap: theme.spacing(2) },
  timerBtn: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  timerBtnStop: { borderColor: theme.warning },
  timerBtnText: { fontFamily: theme.mono, fontSize: 11, letterSpacing: 0.6 },
  pingRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.borderDim },
  pingDot: { width: 8, height: 8, borderRadius: 4 },
  pingText: { flex: 1 },
  pingLabel: { color: theme.text, fontFamily: theme.monoMedium, fontSize: 11, letterSpacing: 0.4 },
  pingEndpoint: { color: theme.muted, fontFamily: theme.mono, fontSize: 9, marginTop: 1 },
  pingStatus: { fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.4 },
  pingButton: { minHeight: 44, marginTop: theme.spacing(1), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: theme.accentDim, borderTopRightRadius: 10 },
  pingButtonText: { color: theme.onAccent, fontFamily: theme.mono, fontSize: 11, letterSpacing: 0.6 },
  pingButtonGhost: { minHeight: 40, marginTop: theme.spacing(1), alignItems: "center", justifyContent: "center", borderWidth: 1, borderStyle: "dashed", borderColor: theme.border },
  pingButtonGhostText: { color: theme.accent, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.4 },
  eject: { minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.error },
  ejectArmed: { backgroundColor: theme.error },
  ejectText: { color: theme.error, fontFamily: theme.mono, fontSize: 11, letterSpacing: 0.5 },
  ejectTextArmed: { color: theme.bgDeep, fontFamily: theme.monoMedium },
  install: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderStyle: "dashed", borderColor: theme.accent, marginTop: theme.spacing(1) },
  installText: { color: theme.accent, fontFamily: theme.mono, fontSize: 11, letterSpacing: 0.6 },
  footer: { paddingHorizontal: theme.spacing(2), paddingTop: theme.spacing(2) },
  footerText: { color: theme.muted, fontSize: 12, lineHeight: 18 },
});
