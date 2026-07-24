import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { GatewayClient } from "@hermes-mobile/api-client";
import { theme } from "@hermes-mobile/ui";
import { resetGatewayClient } from "../client";
import { useApp } from "../store";

// Manual pairing (gateway URL + one-time token). QR scan lands with the
// native dev-client build — same payload, camera instead of typing.
export function PairScreen() {
  const setCredentials = useApp((s) => s.setCredentials);
  const navigate = useApp((s) => s.navigate);
  const [url, setUrl] = useState("http://");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pair = async () => {
    setBusy(true);
    setError(null);
    try {
      const baseUrl = url.trim().replace(/\/$/, "");
      const client = new GatewayClient({ baseUrl });
      const tokens = await client.pair({
        pairingToken: token.trim(),
        deviceName: Platform.OS === "web" ? "web-dev" : `${Platform.OS}-device`,
        platform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web",
      });
      resetGatewayClient();
      setCredentials({ gatewayUrl: baseUrl, tokens });
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.back} onPress={() => navigate({ name: "comms" })} testID="pair-back">
        <Ionicons name="chevron-back" size={18} color={theme.accent} />
        <Text style={styles.backText}>BACK TO HUB</Text>
      </Pressable>
      <Text style={styles.brand}>
        HERMES<Text style={styles.brandSlash}>//</Text>HUB
      </Text>
      <Text style={styles.sub}>Pair with your Hermes gateway</Text>
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="http://192.168.1.x:8790"
        placeholderTextColor={theme.muted}
        testID="pair-url"
      />
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="one-time pairing token"
        placeholderTextColor={theme.muted}
        testID="pair-token"
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.btn} onPress={pair} disabled={busy} testID="pair-submit">
        {busy ? (
          <ActivityIndicator color={theme.onAccent} />
        ) : (
          <Text style={styles.btnText}>Pair</Text>
        )}
      </Pressable>
      <Text style={styles.hint}>
        The gateway prints a QR + token on startup. Tokens are single-use and expire in 10 minutes.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, padding: theme.spacing(6), justifyContent: "center" },
  back: { position: "absolute", top: theme.spacing(12), left: theme.spacing(5), flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 },
  backText: { color: theme.accent, fontFamily: theme.mono, fontSize: 11, letterSpacing: 0.6 },
  brand: { color: theme.text, fontSize: 32, fontFamily: theme.display, textAlign: "center", letterSpacing: 1.5 },
  brandSlash: { color: theme.accent },
  sub: {
    color: theme.muted,
    fontSize: theme.font.body,
    textAlign: "center",
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(8),
  },
  input: {
    color: theme.text,
    fontSize: theme.font.body,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(3),
    marginBottom: theme.spacing(3),
  },
  btn: {
    backgroundColor: theme.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(3),
    alignItems: "center",
    marginTop: theme.spacing(2),
  },
  btnText: { color: theme.onAccent, fontSize: theme.font.body, fontWeight: "700" },
  error: { color: theme.error, fontSize: theme.font.small, marginBottom: theme.spacing(2) },
  hint: {
    color: theme.muted,
    fontSize: theme.font.small,
    textAlign: "center",
    marginTop: theme.spacing(6),
    lineHeight: 17,
  },
});
