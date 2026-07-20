import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "@hermes-mobile/ui";
import { useApp } from "../store";
import { TabBar } from "../components/TabBar";

async function fetchCrypto() {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true";
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`crypto feed HTTP ${res.status}`);
  const d = (await res.json()) as Record<string, { usd: number; usd_24h_change: number }>;
  return [
    { sym: "BTC", name: "Bitcoin", ...d.bitcoin },
    { sym: "ETH", name: "Ethereum", ...d.ethereum },
    { sym: "SOL", name: "Solana", ...d.solana },
  ].filter((x) => x.usd != null);
}

async function fetchFx(gatewayUrl: string | null, token: string | null) {
  // via the gateway: frankfurter blocks browser CORS, and the host caches it
  const res = await fetch(`${gatewayUrl}/v1/fx`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`fx feed HTTP ${res.status}`);
  const d = (await res.json()) as { rates: Record<string, number>; date: string };
  const R = d.rates;
  return {
    date: d.date,
    pairs: [
      ["EUR/USD", 1 / R.EUR],
      ["GBP/USD", 1 / R.GBP],
      ["USD/JPY", R.JPY],
      ["USD/CHF", R.CHF],
      ["USD/CAD", R.CAD],
    ] as [string, number][],
  };
}

/** Market signals — keyless live crypto (CoinGecko) + FX reference rates. */
export function MarketsScreen() {
  const creds = useApp((s) => s.credentials);
  const crypto = useQuery({ queryKey: ["crypto"], queryFn: fetchCrypto, staleTime: 60_000 });
  const fx = useQuery({
    queryKey: ["fx"],
    queryFn: () => fetchFx(creds?.gatewayUrl ?? null, creds?.tokens.accessToken ?? null),
    staleTime: 60 * 60_000,
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Markets</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: theme.spacing(3), gap: theme.spacing(3) }}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Crypto · live</Text>
          {crypto.isLoading && <ActivityIndicator color={theme.accent} />}
          {!!crypto.error && <Text style={styles.err}>{(crypto.error as Error).message}</Text>}
          {crypto.data?.map((c) => (
            <View key={c.sym} style={styles.row}>
              <Text style={styles.sym}>{c.sym}</Text>
              <Text style={styles.name}>{c.name}</Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.price}>
                  ${c.usd >= 1000 ? c.usd.toLocaleString(undefined, { maximumFractionDigits: 0 }) : c.usd.toFixed(2)}
                </Text>
                <Text style={[styles.delta, { color: c.usd_24h_change >= 0 ? theme.success : theme.error }]}>
                  {c.usd_24h_change >= 0 ? "▲" : "▼"} {Math.abs(c.usd_24h_change).toFixed(2)}%
                </Text>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>FX · ECB reference {fx.data ? `(${fx.data.date})` : ""}</Text>
          {fx.isLoading && <ActivityIndicator color={theme.accent} />}
          {!!fx.error && <Text style={styles.err}>{(fx.error as Error).message}</Text>}
          {fx.data?.pairs.map(([pair, rate]) => (
            <View key={pair} style={styles.row}>
              <Text style={styles.sym}>{pair}</Text>
              <Text style={styles.price}>{rate >= 10 ? rate.toFixed(2) : rate.toFixed(4)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <TabBar active="markets" />
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
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing(3),
    gap: theme.spacing(2.5),
  },
  cardTitle: { color: theme.text, fontWeight: "700", fontFamily: theme.fontFamily },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing(3) },
  sym: { color: theme.accent, fontWeight: "700", fontSize: theme.font.small, width: 76 },
  name: { color: theme.muted, fontSize: theme.font.small, flex: 1 },
  price: { color: theme.text, fontSize: theme.font.body, fontWeight: "600", marginLeft: "auto" },
  delta: { fontSize: 11, fontWeight: "700" },
  err: { color: theme.error, fontSize: theme.font.small },
});
