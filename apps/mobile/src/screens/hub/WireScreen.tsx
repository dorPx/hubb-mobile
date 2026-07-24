import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@hermes-mobile/ui";
import { useApp, useHub } from "../../store";

type Region = "local" | "national" | "intl";
type Story = { title: string; source: string; url: string; age: string };

const DEMO: Record<Exclude<Region, "local">, Story[]> = {
  national: [
    { title: "National wire is standing by — add a source or refresh to pull a current feed.", source: "DEMO FEED", url: "https://news.google.com/home?hl=en-US&gl=US&ceid=US:en", age: "NOW" },
    { title: "Open the live wire for the latest national coverage.", source: "GOOGLE NEWS", url: "https://news.google.com/home?hl=en-US&gl=US&ceid=US:en", age: "LIVE" },
  ],
  intl: [
    { title: "International wire is standing by — refresh to pull a current feed.", source: "DEMO FEED", url: "https://news.google.com/world?hl=en-US&gl=US&ceid=US:en", age: "NOW" },
    { title: "Open the live wire for world coverage.", source: "GOOGLE NEWS", url: "https://news.google.com/world?hl=en-US&gl=US&ceid=US:en", age: "LIVE" },
  ],
};

function formatAge(input?: string): string {
  if (!input) return "RECENT";
  const match = input.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!match) return "RECENT";
  const then = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  const hours = Math.max(0, Math.floor((Date.now() - then) / 3_600_000));
  return hours < 1 ? "NOW" : hours < 24 ? `${hours}H AGO` : `${Math.floor(hours / 24)}D AGO`;
}

async function fetchStories(region: Region, city: string): Promise<{ stories: Story[]; live: boolean; detail?: string }> {
  if (region === "local" && !city.trim()) return { stories: [], live: false, detail: "Set a local area in Settings to enable the local wire." };
  const query = region === "local" ? city : region === "national" ? "United States" : "world";
  try {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(`${query} sourcelang:english`)}&mode=artlist&maxrecords=12&format=json&sort=datedesc`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("source unavailable");
    const data = (await response.json()) as { articles?: { title?: string; domain?: string; url?: string; seendate?: string }[] };
    const stories = (data.articles ?? [])
      .filter((story) => story.title && story.url)
      .map((story) => ({ title: story.title as string, source: (story.domain ?? "WIRE").replace(/^www\./, "").toUpperCase(), url: story.url as string, age: formatAge(story.seendate) }));
    if (!stories.length) throw new Error("empty source");
    return { stories, live: true };
  } catch {
    return { stories: region === "local" ? [] : DEMO[region], live: false, detail: "Live source is temporarily unavailable. These links open a real news front." };
  }
}

/** Three-region wire with bounded live fetches and honest offline fallback. */
export function WireScreen() {
  const [region, setRegion] = useState<Region>("national");
  const city = useHub((s) => s.city);
  const navigate = useApp((s) => s.navigate);
  const feed = useQuery({ queryKey: ["hub-wire", region, city], queryFn: () => fetchStories(region, city), staleTime: 10 * 60_000, retry: 0 });

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View>
          <Text style={styles.title}>NEWS WIRE</Text>
          <Text style={[styles.status, { color: feed.data?.live ? theme.success : theme.warning }]}>{feed.data?.live ? "● GDELT // LIVE" : "● DEMO FEED // FALLBACK"}</Text>
        </View>
        <Pressable style={styles.refresh} onPress={() => void feed.refetch()} accessibilityLabel="Refresh news wire" testID="wire-refresh">
          <Ionicons name="refresh" size={19} color={theme.accent} />
        </Pressable>
      </View>
      <View style={styles.segment}>
        {(["local", "national", "intl"] as Region[]).map((item) => (
          <Pressable
            key={item}
            style={[styles.segmentItem, region === item && styles.segmentItemActive]}
            onPress={() => setRegion(item)}
            accessibilityRole="tab"
            accessibilityState={{ selected: region === item }}
            testID={`wire-${item}`}
          >
            <Text style={[styles.segmentLabel, region === item && styles.segmentLabelActive]}>{item === "intl" ? "INTL" : item.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
      {!!feed.data?.detail && <Text style={styles.explainer}>{feed.data.detail}</Text>}
      {feed.isLoading && <ActivityIndicator color={theme.accent} style={styles.loader} />}
      {region === "local" && !city.trim() ? (
        <View style={styles.empty}>
          <Ionicons name="location-outline" size={29} color={theme.warning} />
          <Text style={styles.emptyTitle}>LOCAL WIRE NEEDS A FIX</Text>
          <Text style={styles.emptyText}>Choose a city in Settings and this channel will begin querying a live regional feed.</Text>
          <Pressable style={styles.notchedButton} onPress={() => navigate({ name: "hub-settings" })}>
            <Text style={styles.notchedButtonText}>OPEN SETTINGS</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {(feed.data?.stories ?? []).map((story, index) => (
            <Pressable key={`${story.url}-${index}`} style={styles.story} onPress={() => void Linking.openURL(story.url)}>
              <Text style={styles.storyTitle}>{story.title}</Text>
              <View style={styles.storyMeta}><Text style={styles.metaText}>{story.source} · {story.age}</Text><Ionicons name="open-outline" size={14} color={theme.muted} /></View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  head: { minHeight: 72, paddingHorizontal: theme.spacing(4), paddingVertical: theme.spacing(3), flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: theme.border },
  title: { color: theme.text, fontFamily: theme.display, fontSize: 22, letterSpacing: 1 },
  status: { fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.6, marginTop: 4 },
  refresh: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", gap: 8, paddingHorizontal: theme.spacing(3), paddingTop: theme.spacing(3) },
  segmentItem: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  segmentItemActive: { borderColor: theme.accent, backgroundColor: theme.surfaceHigh },
  segmentLabel: { color: theme.muted, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.6 },
  segmentLabelActive: { color: theme.accent },
  explainer: { color: theme.muted, paddingHorizontal: theme.spacing(4), paddingTop: theme.spacing(3), fontSize: 12, lineHeight: 18 },
  loader: { marginTop: 42 },
  list: { paddingTop: theme.spacing(2) },
  story: { minHeight: 82, paddingHorizontal: theme.spacing(4), paddingVertical: theme.spacing(3), borderBottomWidth: 1, borderBottomColor: theme.border, gap: 8 },
  storyTitle: { color: theme.text, fontSize: 15, lineHeight: 21 },
  storyMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  metaText: { color: theme.muted, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.3 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: theme.spacing(6), gap: theme.spacing(3) },
  emptyTitle: { color: theme.text, fontFamily: theme.fontFamilyBold, fontSize: 17, textAlign: "center" },
  emptyText: { color: theme.muted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  notchedButton: { minHeight: 44, marginTop: theme.spacing(2), paddingHorizontal: theme.spacing(3), justifyContent: "center", backgroundColor: theme.accentDim, borderTopRightRadius: 10 },
  notchedButtonText: { color: theme.onAccent, fontFamily: theme.mono, fontSize: 11, letterSpacing: 0.5 },
});
