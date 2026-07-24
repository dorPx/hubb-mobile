import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@hermes-mobile/ui";
import { isEndpointLive } from "../../chat";
import { type AgentEndpoint, type HubAgent, useApp, useHub } from "../../store";
import { GoogleSection } from "./GoogleSection";

const AGENT_META: { id: HubAgent; name: string; color: string }[] = [
  { id: "hermes", name: "HERMES", color: theme.agentHermes },
  { id: "openai", name: "OPENAI", color: theme.agentCodex },
  { id: "claude", name: "CLAUDE", color: theme.agentClaude },
];

/** One-tap provider presets per agent (fill base URL + model; key stays yours). */
const PRESETS: Record<HubAgent, { label: string; baseUrl: string; model: string }[]> = {
  hermes: [
    { label: "Nous", baseUrl: "https://inference-api.nousresearch.com/v1", model: "Hermes-4-405B" },
    { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "nousresearch/hermes-4-405b" },
  ],
  openai: [
    { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o" },
    { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o" },
  ],
  claude: [
    { label: "Anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-opus-4-8" },
    { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "anthropic/claude-opus-4-8" },
  ],
};

/** SET bay — operator identity, wire locale, MoA, gateway pairing, and local data. */
export function HubSettingsScreen() {
  const callsign = useHub((s) => s.callsign);
  const unit = useHub((s) => s.temperatureUnit);
  const city = useHub((s) => s.city);
  const moaArmed = useHub((s) => s.moaArmed);
  const setOperator = useHub((s) => s.setHubOperator);
  const setUnit = useHub((s) => s.setHubUnit);
  const setCity = useHub((s) => s.setHubCity);
  const setMoa = useHub((s) => s.setMoaArmed);
  const endpoints = useHub((s) => s.endpoints);
  const setEndpoint = useHub((s) => s.setAgentEndpoint);
  const clearConversation = useHub((s) => s.clearHubConversation);
  const resetBoard = useHub((s) => s.resetBoard);
  const resetHub = useHub((s) => s.resetHub);
  const credentials = useApp((s) => s.credentials);
  const navigate = useApp((s) => s.navigate);
  const setCredentials = useApp((s) => s.setCredentials);

  const [cityDraft, setCityDraft] = useState(city);
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const timeout = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(timeout);
  }, [armed]);

  const fire = (id: string, action: () => void) => {
    if (armed === id) { action(); setArmed(null); }
    else setArmed(id);
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>SETTINGS</Text>
        <View style={styles.badge}>
          <Ionicons name="lock-closed-outline" size={11} color={theme.muted} />
          <Text style={styles.badgeText}>ALL CONFIG STAYS ON THIS DEVICE</Text>
        </View>
      </View>

      <Section label="OPERATOR">
        <Field label="CALLSIGN" help="The briefing greets you by this.">
          <TextInput
            style={[styles.input, styles.inputMono]}
            value={callsign}
            onChangeText={(v) => setOperator(v.toUpperCase())}
            autoCapitalize="characters"
            maxLength={24}
            placeholder="OPERATOR"
            placeholderTextColor={theme.muted}
            testID="set-callsign"
          />
        </Field>
        <Text style={styles.fieldLabel}>UNITS</Text>
        <Segmented
          options={[{ value: "F", label: "°F · MPH" }, { value: "C", label: "°C · KM/H" }]}
          value={unit}
          onChange={(v) => setUnit(v as "F" | "C")}
          testID="set-units"
        />
      </Section>

      <Section label="NEWS WIRE & ATMOSPHERICS" help="Weather via open-meteo (keyless); geotags the LOCAL wire.">
        <Field label="LOCAL AREA" help="Leave blank to keep local weather and wire on demo.">
          <View style={styles.cityRow}>
            <TextInput
              style={[styles.input, styles.cityInput]}
              value={cityDraft}
              onChangeText={setCityDraft}
              onSubmitEditing={() => setCity(cityDraft.trim())}
              placeholder="e.g. Portland"
              placeholderTextColor={theme.muted}
              returnKeyType="done"
              testID="set-city"
            />
            <Pressable
              style={[styles.setButton, cityDraft.trim() === city.trim() && styles.disabled]}
              onPress={() => setCity(cityDraft.trim())}
              disabled={cityDraft.trim() === city.trim()}
              testID="set-city-apply"
            >
              <Text style={styles.setButtonText}>SET</Text>
            </Pressable>
          </View>
          {!!city.trim() && (
            <View style={styles.locBadge}>
              <Ionicons name="location" size={11} color={theme.success} />
              <Text style={styles.locBadgeText}>{city.toUpperCase()}</Text>
            </View>
          )}
        </Field>
      </Section>

      <Section label="MOA SWARM" help="Arm a small advisory swarm before Hermes answers in COMMS.">
        <Pressable style={styles.switchRow} onPress={() => setMoa(!moaArmed)} accessibilityRole="switch" accessibilityState={{ checked: moaArmed }} testID="set-moa">
          <View>
            <Text style={styles.switchLabel}>ARM MOA BY DEFAULT</Text>
            <Text style={styles.switchHint}>{moaArmed ? "Hermes will fuse proposer traces." : "Hermes answers directly."}</Text>
          </View>
          <View style={[styles.switch, moaArmed && styles.switchOn]}>
            <View style={[styles.knob, moaArmed && styles.knobOn]} />
          </View>
        </Pressable>
      </Section>

      <Section label="FLEET ENDPOINTS / API KEYS" help="Point each agent at any OpenAI-compatible API. Keys stay on this device; COMMS goes live once base URL + key + model are set.">
        {AGENT_META.map((agent) => (
          <EndpointEditor
            key={agent.id}
            agent={agent}
            endpoint={endpoints[agent.id]}
            onChange={(patch) => setEndpoint(agent.id, patch)}
          />
        ))}
      </Section>

      <Section label="HERMES GATEWAY" help="Live sessions run server-side; the phone is a viewer.">
        <View style={styles.gatewayRow}>
          <View style={[styles.statusDot, { backgroundColor: credentials ? theme.success : theme.warning }]} />
          <View style={styles.gatewayText}>
            <Text style={styles.gatewayState}>{credentials ? "PAIRED · ONLINE" : "NOT PAIRED · DEMO"}</Text>
            <Text style={styles.gatewayUrl} numberOfLines={1}>{credentials?.gatewayUrl ?? "The command surface runs fully offline until paired."}</Text>
          </View>
        </View>
        {credentials ? (
          <>
            <View style={styles.buttonPair}>
              <Pressable style={[styles.ghostButton, styles.flex1]} onPress={() => navigate({ name: "sessions" })} testID="set-open-console">
                <Text style={styles.ghostButtonText}>OPEN CONSOLE</Text>
              </Pressable>
              <Pressable
                style={[styles.armButton, styles.flex1, armed === "unpair" && styles.armButtonHot]}
                onPress={() => fire("unpair", () => setCredentials(null))}
                testID="set-unpair"
              >
                <Text style={[styles.armButtonText, armed === "unpair" && styles.armButtonTextHot]}>{armed === "unpair" ? "TAP AGAIN" : "UNPAIR"}</Text>
              </Pressable>
            </View>
            <Pressable style={styles.ghostButton} onPress={() => navigate({ name: "ssh" })} testID="set-ssh">
              <Text style={styles.ghostButtonText}>◈ SSH ACCESS POINT</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.primaryButton} onPress={() => navigate({ name: "pair" })} testID="set-pair">
            <Ionicons name="link-outline" size={16} color={theme.onAccent} />
            <Text style={styles.primaryButtonText}>PAIR A GATEWAY</Text>
          </Pressable>
        )}
      </Section>

      <Section label="GOOGLE ACCOUNT" help="Read-only Calendar, Gmail, Contacts, Tasks & Drive. One tap feeds your briefing; the token stays on this device.">
        <GoogleSection />
      </Section>

      <Section label="DATA" help="Everything lives in on-device storage. These actions are immediate.">
        <ArmedButton id="clear-comms" idle="CLEAR COMMS LOG" armedId={armed} onFire={fire} action={() => { clearConversation("hermes"); clearConversation("openai"); clearConversation("claude"); }} />
        <ArmedButton id="reset-board" idle="RESET BOARD TO SEED" armedId={armed} onFire={fire} action={resetBoard} />
        <ArmedButton id="factory" idle="FULL RESET" confirm="ERASE EVERYTHING" danger armedId={armed} onFire={fire} action={resetHub} />
      </Section>

      <Text style={styles.colophon}>HERMES//HUB — dispatch surface for the agent fleet.</Text>
    </ScrollView>
  );
}

function Section({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {!!help && <Text style={styles.sectionHelp}>{help}</Text>}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {!!help && <Text style={styles.fieldHelp}>{help}</Text>}
    </View>
  );
}

function EndpointEditor({ agent, endpoint, onChange }: { agent: { id: HubAgent; name: string; color: string }; endpoint: AgentEndpoint; onChange: (patch: Partial<AgentEndpoint>) => void }) {
  const live = isEndpointLive(endpoint);
  const [showKey, setShowKey] = useState(false);
  return (
    <View style={styles.endpoint}>
      <View style={styles.endpointHead}>
        <View style={[styles.endpointDot, { backgroundColor: agent.color }]} />
        <Text style={styles.endpointName}>{agent.name}</Text>
        <Text style={[styles.endpointState, { color: live ? theme.success : theme.warning }]}>{live ? "● LIVE" : "○ DEMO"}</Text>
      </View>
      <View style={styles.presetRow}>
        {PRESETS[agent.id].map((p) => (
          <Pressable key={p.label} style={styles.presetChip} onPress={() => onChange({ baseUrl: p.baseUrl, model: p.model })} testID={`ep-preset-${agent.id}-${p.label}`}>
            <Text style={styles.presetText}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={styles.endpointInput} value={endpoint.baseUrl} onChangeText={(v) => onChange({ baseUrl: v })} placeholder="Base URL — https://…/v1" placeholderTextColor={theme.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url" testID={`ep-url-${agent.id}`} />
      <TextInput style={styles.endpointInput} value={endpoint.model} onChangeText={(v) => onChange({ model: v })} placeholder="Model id" placeholderTextColor={theme.muted} autoCapitalize="none" autoCorrect={false} testID={`ep-model-${agent.id}`} />
      <View style={styles.keyRow}>
        <TextInput style={[styles.endpointInput, styles.keyInput]} value={endpoint.apiKey} onChangeText={(v) => onChange({ apiKey: v })} placeholder="API key" placeholderTextColor={theme.muted} secureTextEntry={!showKey} autoCapitalize="none" autoCorrect={false} testID={`ep-key-${agent.id}`} />
        <Pressable style={styles.keyToggle} onPress={() => setShowKey((s) => !s)} accessibilityLabel={showKey ? "Hide key" : "Show key"}>
          <Ionicons name={showKey ? "eye-off-outline" : "eye-outline"} size={18} color={theme.muted} />
        </Pressable>
      </View>
    </View>
  );
}

function Segmented({ options, value, onChange, testID }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; testID?: string }) {
  return (
    <View style={styles.segment} testID={testID}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable key={opt.value} style={[styles.segmentItem, active && styles.segmentItemActive]} onPress={() => onChange(opt.value)} accessibilityState={{ selected: active }}>
            <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ArmedButton({ id, idle, confirm = "TAP AGAIN", danger, armedId, onFire, action }: { id: string; idle: string; confirm?: string; danger?: boolean; armedId: string | null; onFire: (id: string, action: () => void) => void; action: () => void }) {
  const hot = armedId === id;
  return (
    <Pressable
      style={[styles.armButton, danger && styles.armButtonDanger, hot && (danger ? styles.armButtonDangerHot : styles.armButtonHot)]}
      onPress={() => onFire(id, action)}
      testID={`set-${id}`}
    >
      <Text style={[styles.armButtonText, danger && styles.armButtonTextDanger, hot && styles.armButtonTextHot]}>{hot ? confirm : idle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  content: { padding: theme.spacing(4), paddingBottom: theme.spacing(8), gap: theme.spacing(4) },
  header: { gap: theme.spacing(2) },
  title: { color: theme.text, fontFamily: theme.display, fontSize: 24, letterSpacing: 1 },
  badge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 8, paddingVertical: 5 },
  badgeText: { color: theme.muted, fontFamily: theme.mono, fontSize: 9, letterSpacing: 0.5 },
  section: { gap: theme.spacing(2) },
  sectionLabel: { color: theme.accent, fontFamily: theme.monoMedium, fontSize: 11, letterSpacing: 0.8 },
  sectionHelp: { color: theme.muted, fontSize: 12, lineHeight: 18 },
  sectionBody: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, padding: theme.spacing(3), gap: theme.spacing(3), marginTop: 2 },
  field: { gap: theme.spacing(2) },
  fieldLabel: { color: theme.muted, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.6 },
  fieldHelp: { color: theme.muted, fontSize: 11, lineHeight: 16 },
  input: { minHeight: 44, color: theme.text, backgroundColor: theme.bgDeep, borderWidth: 1, borderColor: theme.border, paddingHorizontal: theme.spacing(3), fontSize: 15 },
  inputMono: { fontFamily: theme.mono, letterSpacing: 1 },
  cityRow: { flexDirection: "row", gap: theme.spacing(2) },
  cityInput: { flex: 1 },
  setButton: { minWidth: 60, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: theme.accentDim, borderTopRightRadius: 10 },
  setButtonText: { color: theme.onAccent, fontFamily: theme.mono, fontSize: 11, letterSpacing: 0.6 },
  disabled: { opacity: 0.4 },
  locBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  locBadgeText: { color: theme.success, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.5 },
  segment: { flexDirection: "row", gap: theme.spacing(2) },
  segmentItem: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border, backgroundColor: theme.bgDeep },
  segmentItemActive: { borderColor: theme.accent, backgroundColor: theme.surfaceHigh },
  segmentLabel: { color: theme.muted, fontFamily: theme.mono, fontSize: 11, letterSpacing: 0.5 },
  segmentLabelActive: { color: theme.accent },
  endpoint: { borderWidth: 1, borderColor: theme.border, backgroundColor: theme.bgDeep, padding: theme.spacing(2), gap: theme.spacing(2) },
  endpointHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  endpointDot: { width: 8, height: 8, borderRadius: 4 },
  endpointName: { flex: 1, color: theme.text, fontFamily: theme.monoMedium, fontSize: 12, letterSpacing: 0.6 },
  endpointState: { fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.5 },
  presetRow: { flexDirection: "row", gap: theme.spacing(2) },
  presetChip: { minHeight: 32, justifyContent: "center", paddingHorizontal: theme.spacing(2), borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  presetText: { color: theme.accent, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.4 },
  endpointInput: { minHeight: 42, color: theme.text, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, paddingHorizontal: theme.spacing(2), fontFamily: theme.mono, fontSize: 12 },
  keyRow: { flexDirection: "row", gap: theme.spacing(1), alignItems: "center" },
  keyInput: { flex: 1 },
  keyToggle: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing(3) },
  switchLabel: { color: theme.text, fontFamily: theme.monoMedium, fontSize: 12, letterSpacing: 0.4 },
  switchHint: { color: theme.muted, fontSize: 11, marginTop: 3 },
  switch: { width: 46, height: 27, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.bgDeep, padding: 2, justifyContent: "center" },
  switchOn: { borderColor: theme.warning, backgroundColor: "#332817" },
  knob: { width: 19, height: 19, borderRadius: 10, backgroundColor: theme.muted },
  knobOn: { backgroundColor: theme.warning, alignSelf: "flex-end" },
  gatewayRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing(2) },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  gatewayText: { flex: 1 },
  gatewayState: { color: theme.text, fontFamily: theme.monoMedium, fontSize: 11, letterSpacing: 0.5 },
  gatewayUrl: { color: theme.muted, fontFamily: theme.mono, fontSize: 10, marginTop: 2 },
  buttonPair: { flexDirection: "row", gap: theme.spacing(2) },
  flex1: { flex: 1 },
  primaryButton: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: theme.accentDim, borderTopRightRadius: 10 },
  primaryButtonText: { color: theme.onAccent, fontFamily: theme.mono, fontSize: 12, letterSpacing: 0.6 },
  ghostButton: { minHeight: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.accent },
  ghostButtonText: { color: theme.accent, fontFamily: theme.mono, fontSize: 11, letterSpacing: 0.6 },
  armButton: { minHeight: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  armButtonHot: { borderColor: theme.warning, backgroundColor: theme.warning },
  armButtonDanger: { borderColor: theme.error },
  armButtonDangerHot: { borderColor: theme.error, backgroundColor: theme.error },
  armButtonText: { color: theme.text, fontFamily: theme.mono, fontSize: 11, letterSpacing: 0.5 },
  armButtonTextDanger: { color: theme.error },
  armButtonTextHot: { color: theme.bgDeep, fontFamily: theme.monoMedium },
  colophon: { color: theme.muted, fontFamily: theme.mono, fontSize: 9, letterSpacing: 0.5, textAlign: "center", marginTop: theme.spacing(2) },
});
