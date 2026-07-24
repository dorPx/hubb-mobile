import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { theme } from "@hermes-mobile/ui";
import { GOOGLE_DISCOVERY, GOOGLE_SCOPES, GOOGLE_SERVICES, fetchUserEmail, isGoogleLive } from "../../google";
import { useHub } from "../../store";

// Completes the auth session when the browser redirects back (web + native).
WebBrowser.maybeCompleteAuthSession();

/** Connect a Google account (read-only) to feed the briefing. Uses the implicit
 * token flow — no client secret needed; the app re-consents when tokens lapse. */
export function GoogleSection() {
  const clientId = useHub((s) => s.googleClientId);
  const setClientId = useHub((s) => s.setGoogleClientId);
  const google = useHub((s) => s.google);
  const setGoogle = useHub((s) => s.setGoogleAccount);
  const [armed, setArmed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null);

  const redirectUri = AuthSession.makeRedirectUri();
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: clientId || "unconfigured",
      scopes: GOOGLE_SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Token,
      extraParams: { include_granted_scopes: "true", prompt: "consent" },
    },
    GOOGLE_DISCOVERY,
  );

  useEffect(() => {
    if (!response) return;
    if (response.type === "success") {
      const token = response.authentication?.accessToken ?? response.params?.access_token;
      if (!token) {
        setMsg("No access token returned.");
        return;
      }
      const expiresIn = Number(response.authentication?.expiresIn ?? response.params?.expires_in ?? 3600);
      void fetchUserEmail(token).then((email) => {
        setGoogle({ accessToken: token, expiresAt: Date.now() + expiresIn * 1000, email, scopes: GOOGLE_SCOPES });
        setMsg(null);
      });
    } else if (response.type === "error") {
      setMsg(response.error?.message ?? "authorization failed");
    }
  }, [response, setGoogle]);

  useEffect(() => () => { if (disarm.current) clearTimeout(disarm.current); }, []);

  const connect = () => {
    if (!clientId.trim()) {
      setMsg("Paste your Google OAuth client ID first.");
      return;
    }
    setMsg(null);
    void promptAsync();
  };

  const live = isGoogleLive(google);

  if (google) {
    return (
      <View style={styles.wrap}>
        <View style={styles.connectedRow}>
          <View style={[styles.dot, { backgroundColor: live ? theme.success : theme.warning }]} />
          <View style={styles.grow}>
            <Text style={styles.connectedLabel}>{live ? "CONNECTED" : "TOKEN EXPIRED"}</Text>
            {!!google.email && <Text style={styles.email}>{google.email}</Text>}
          </View>
        </View>
        <View style={styles.services}>
          {GOOGLE_SERVICES.map((s) => (
            <View key={s} style={styles.serviceChip}>
              <Ionicons name="checkmark" size={11} color={theme.success} />
              <Text style={styles.serviceText}>{s}</Text>
            </View>
          ))}
        </View>
        {!live && <Text style={styles.hint}>Access tokens last ~1 hour. Reconnect to refresh the briefing.</Text>}
        <View style={styles.actions}>
          <Pressable style={[styles.ghost, styles.grow]} onPress={connect} disabled={!request} testID="google-reconnect">
            <Text style={styles.ghostText}>RECONNECT</Text>
          </Pressable>
          <Pressable
            style={[styles.ghost, styles.grow, armed && styles.armed]}
            onPress={() => {
              if (armed) {
                setGoogle(null);
                setArmed(false);
              } else {
                setArmed(true);
                if (disarm.current) clearTimeout(disarm.current);
                disarm.current = setTimeout(() => setArmed(false), 3000);
              }
            }}
            testID="google-disconnect"
          >
            <Text style={[styles.ghostText, armed && styles.armedText]}>{armed ? "TAP AGAIN" : "DISCONNECT"}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>OAUTH CLIENT ID</Text>
      <TextInput
        style={styles.input}
        value={clientId}
        onChangeText={setClientId}
        placeholder="…apps.googleusercontent.com"
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        autoCorrect={false}
        testID="google-client-id"
      />
      <Text style={styles.hint}>
        One-time setup: Google Cloud Console → create an OAuth client → enable Calendar, Gmail, People, Tasks & Drive APIs → add this redirect URI:
      </Text>
      <Text style={styles.redirect} selectable>{redirectUri}</Text>
      <Pressable style={[styles.connect, !clientId.trim() && styles.disabled]} onPress={connect} disabled={!clientId.trim() || !request} testID="google-connect">
        <Ionicons name="logo-google" size={16} color={theme.onAccent} />
        <Text style={styles.connectText}>CONNECT GOOGLE</Text>
      </Pressable>
      {!!msg && <Text style={styles.error}>{msg}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing(2) },
  label: { color: theme.muted, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.6 },
  input: { minHeight: 44, color: theme.text, backgroundColor: theme.bgDeep, borderWidth: 1, borderColor: theme.border, paddingHorizontal: theme.spacing(3), fontFamily: theme.mono, fontSize: 12 },
  hint: { color: theme.muted, fontSize: 11, lineHeight: 17 },
  redirect: { color: theme.accent, fontFamily: theme.mono, fontSize: 11, backgroundColor: theme.bgDeep, borderWidth: 1, borderColor: theme.border, padding: theme.spacing(2) },
  connect: { minHeight: 46, marginTop: theme.spacing(1), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: theme.accentDim, borderTopRightRadius: 10 },
  connectText: { color: theme.onAccent, fontFamily: theme.mono, fontSize: 12, letterSpacing: 0.6 },
  disabled: { opacity: 0.45 },
  error: { color: theme.error, fontSize: 12 },
  connectedRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing(2) },
  dot: { width: 9, height: 9, borderRadius: 5 },
  grow: { flex: 1 },
  connectedLabel: { color: theme.text, fontFamily: theme.monoMedium, fontSize: 11, letterSpacing: 0.5 },
  email: { color: theme.muted, fontFamily: theme.mono, fontSize: 11, marginTop: 2 },
  services: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing(2) },
  serviceChip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 8, paddingVertical: 5 },
  serviceText: { color: theme.text, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.4 },
  actions: { flexDirection: "row", gap: theme.spacing(2), marginTop: theme.spacing(1) },
  ghost: { minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.accent },
  ghostText: { color: theme.accent, fontFamily: theme.mono, fontSize: 11, letterSpacing: 0.6 },
  armed: { borderColor: theme.error, backgroundColor: theme.error },
  armedText: { color: theme.bgDeep, fontFamily: theme.monoMedium },
});
