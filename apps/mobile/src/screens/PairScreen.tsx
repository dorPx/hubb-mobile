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
import { GatewayClient } from "@hermes-mobile/api-client";
import { theme } from "@hermes-mobile/ui";
import { resetGatewayClient } from "../client";
import { useApp } from "../store";

// Manual pairing (gateway URL + one-time token). QR scan lands with the
// native dev-client build — same payload, camera instead of typing.
export function PairScreen() {
  const setCredentials = useApp((s) => s.setCredentials);
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
      <Text style={styles.brand}>Hermes Mobile</Text>
      <Text style={styles.sub}>Pair with your desktop gateway</Text>
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
          <ActivityIndicator color={theme.bg} />
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
  brand: { color: theme.accent, fontSize: 28, fontWeight: "700", textAlign: "center" },
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
  btnText: { color: theme.bg, fontSize: theme.font.body, fontWeight: "700" },
  error: { color: theme.error, fontSize: theme.font.small, marginBottom: theme.spacing(2) },
  hint: {
    color: theme.muted,
    fontSize: theme.font.small,
    textAlign: "center",
    marginTop: theme.spacing(6),
    lineHeight: 17,
  },
});
