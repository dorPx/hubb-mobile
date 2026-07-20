import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { theme } from "@hermes-mobile/ui";
import { useApp } from "../store";
import { TabBar } from "../components/TabBar";

type Region = "national" | "world" | "tech";
const QUERIES: Record<Region, string> = {
  national: "united states",
  world: "world",
  tech: "technology",
};

function age(sd?: string): string {
  if (!sd) return "—";
  const t = Date.UTC(+sd.slice(0, 4), +sd.slice(4, 6) - 1, +sd.slice(6, 8), +sd.slice(9, 11), +sd.slice(11, 13));
  const h = (Date.now() - t) / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// Wire flows through the gateway (server-side cache; no CORS trouble),
// falling back to a direct keyless GDELT call if the gateway is older.
async function fetchWire(region: Region, gatewayUrl: string | null, token: string | null) {
  type Item = { title: string; src: string; seendate: string | null; url: string };
  if (gatewayUrl && token) {
    const res = await fetch(`${gatewayUrl}/v1/news?q=${encodeURIComponent(QUERIES[region])}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const items = (await res.json()) as Item[];
      if (items.length) return items.map((a) => ({ ...a, age: age(a.seendate ?? undefined) }));
    }
  }
  const url =
    "https://api.gdeltproject.org/api/v2/doc/doc?query=" +
    encodeURIComponent(`${QUERIES[region]} sourcelang:english`) +
    "&mode=artlist&maxrecords=14&format=json&sort=datedesc";
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`wire unreachable (HTTP ${res.status})`);
  const d = (await res.json()) as { articles?: { title: string; domain?: string; seendate?: string; url: string }[] };
  const items = (d.articles ?? []).map((a) => ({
    title: a.title,
    src: (a.domain ?? "").replace(/^www\./, ""),
    age: age(a.seendate),
    url: a.url,
  }));
  if (!items.length) throw new Error("wire returned nothing — try again shortly");
  return items;
}

/** Live news wire — keyless GDELT feed, fresh on every visit. */
export function NewsScreen() {
  const [region, setRegion] = useState<Region>("national");
  const creds = useApp((s) => s.credentials);
  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["news", region],
    queryFn: () => fetchWire(region, creds?.gatewayUrl ?? null, creds?.tokens.accessToken ?? null),
    staleTime: 5 * 60_000,
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>News wire</Text>
        <Pressable onPress={() => refetch()} hitSlop={10} testID="news-refresh">
          <Text style={styles.refresh}>{isRefetching ? "…" : "refresh"}</Text>
        </Pressable>
      </View>
      <View style={styles.seg}>
        {(["national", "world", "tech"] as Region[]).map((r) => (
          <Pressable
            key={r}
            style={[styles.segBtn, region === r && styles.segBtnActive]}
            onPress={() => setRegion(r)}
            testID={`news-${r}`}
          >
            <Text style={[styles.segText, region === r && styles.segTextActive]}>
              {r.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>
      {isLoading && <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />}
      {!!error && <Text style={styles.err}>{(error as Error).message}</Text>}
      <FlatList
        data={data ?? []}
        keyExtractor={(a) => a.url}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => Linking.openURL(item.url)}>
            <Text style={styles.headline}>{item.title}</Text>
            <Text style={styles.meta}>
              {item.src} · {item.age}
            </Text>
          </Pressable>
        )}
      />
      <TabBar active="news" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing(4),
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.sidebar,
  },
  title: { color: theme.text, fontSize: 20, fontWeight: "700", fontFamily: theme.fontFamily },
  refresh: { color: theme.accent, fontSize: theme.font.small, fontWeight: "600" },
  seg: { flexDirection: "row", gap: theme.spacing(2), padding: theme.spacing(3) },
  segBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(1.5),
  },
  segBtnActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  segText: { color: theme.muted, fontSize: theme.font.small, fontWeight: "700" },
  segTextActive: { color: theme.onAccent },
  row: {
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: 3,
  },
  headline: { color: theme.text, fontSize: theme.font.body, lineHeight: 21, fontFamily: theme.fontFamily },
  meta: { color: theme.muted, fontSize: theme.font.small },
  err: { color: theme.error, padding: theme.spacing(4) },
});
