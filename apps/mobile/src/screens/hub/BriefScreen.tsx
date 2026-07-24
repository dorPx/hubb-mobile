import { useQuery } from "@tanstack/react-query";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@hermes-mobile/ui";
import { fetchGoogleBrief, isGoogleLive } from "../../google";
import { useApp, useHub } from "../../store";

type Weather = { temp: number; high: number; low: number; condition: string; wind: number; humidity: number; live: boolean };

const WMO: Record<number, string> = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 51: "Drizzle", 61: "Rain", 63: "Rain", 71: "Snow", 80: "Showers", 95: "Storm" };

async function openWeather(city: string, unit: "F" | "C", key: string): Promise<Weather | null> {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=${unit === "F" ? "imperial" : "metric"}&appid=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(9_000) });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      main: { temp: number; temp_min: number; temp_max: number; humidity: number };
      wind: { speed: number };
      weather?: { main: string }[];
    };
    return {
      temp: Math.round(d.main.temp),
      high: Math.round(d.main.temp_max),
      low: Math.round(d.main.temp_min),
      condition: d.weather?.[0]?.main ?? "Current conditions",
      wind: Math.round(d.wind.speed),
      humidity: d.main.humidity,
      live: true,
    };
  } catch {
    return null;
  }
}

async function weatherFor(city: string, unit: "F" | "C", owmKey: string): Promise<Weather> {
  const fallback: Weather = { temp: unit === "F" ? 72 : 22, high: unit === "F" ? 76 : 24, low: unit === "F" ? 61 : 16, condition: "Clear", wind: unit === "F" ? 8 : 13, humidity: 48, live: false };
  if (!city.trim()) return fallback;
  // Prefer OpenWeather when a key is set; fall back to keyless open-meteo.
  if (owmKey.trim()) {
    const owm = await openWeather(city, unit, owmKey.trim());
    if (owm) return owm;
  }
  try {
    const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`, { signal: AbortSignal.timeout(8_000) });
    const place = ((await geo.json()) as { results?: { latitude: number; longitude: number }[] }).results?.[0];
    if (!geo.ok || !place) return fallback;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&temperature_unit=${unit === "F" ? "fahrenheit" : "celsius"}&wind_speed_unit=${unit === "F" ? "mph" : "kmh"}&timezone=auto`;
    const result = await fetch(url, { signal: AbortSignal.timeout(9_000) });
    if (!result.ok) return fallback;
    const data = (await result.json()) as { current: { temperature_2m: number; relative_humidity_2m: number; weather_code: number; wind_speed_10m: number }; daily: { temperature_2m_max: number[]; temperature_2m_min: number[] } };
    return { temp: Math.round(data.current.temperature_2m), high: Math.round(data.daily.temperature_2m_max[0]), low: Math.round(data.daily.temperature_2m_min[0]), condition: WMO[data.current.weather_code] ?? "Current conditions", wind: Math.round(data.current.wind_speed_10m), humidity: data.current.relative_humidity_2m, live: true };
  } catch {
    return fallback;
  }
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5 || hour >= 21) return "NIGHT WATCH,";
  if (hour < 12) return "GOOD MORNING,";
  if (hour < 17) return "GOOD AFTERNOON,";
  return "GOOD EVENING,";
}

function todayPlate(): string {
  const now = new Date();
  return `${now.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()} ${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
}

/** A useful briefing without any setup; local city upgrades weather to live data. */
export function BriefScreen() {
  const callsign = useHub((s) => s.callsign);
  const city = useHub((s) => s.city);
  const unit = useHub((s) => s.temperatureUnit);
  const board = useHub((s) => s.board);
  const conversations = useHub((s) => s.conversations);
  const google = useHub((s) => s.google);
  const owmKey = useHub((s) => s.owmKey);
  const credentials = useApp((s) => s.credentials);
  const navigate = useApp((s) => s.navigate);
  const weather = useQuery({ queryKey: ["hub-weather", city, unit, owmKey], queryFn: () => weatherFor(city, unit, owmKey), staleTime: 15 * 60_000, retry: 0 });
  const googleLive = isGoogleLive(google);
  const gbrief = useQuery({
    queryKey: ["google-brief", google?.accessToken],
    queryFn: () => fetchGoogleBrief(google!.accessToken),
    enabled: googleLive,
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const gdata = googleLive ? gbrief.data : undefined;
  const queue = board.filter((task) => task.lane === "queue");
  const active = board.filter((task) => task.lane === "active");
  const shipped = board.filter((task) => task.lane === "shipped");
  const messages = Object.values(conversations).flat().filter((message) => message.role === "user").length;
  const degree = unit === "F" ? "°" : "°";
  const wx = weather.data;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <Text style={styles.date}>{todayPlate()}</Text>
      <Text style={styles.greeting}>{greeting()}</Text>
      <Text style={styles.callsign}>{callsign || "OPERATOR"}<Text style={styles.cursor}>_</Text></Text>

      <View style={[styles.card, styles.leadCard]}>
        <View style={styles.cardTop}>
          <Text style={styles.cardKicker}>DAILY BRIEFING // COMPILED NOW</Text>
          <Pressable style={styles.iconButton} onPress={() => void weather.refetch()} accessibilityLabel="Recompile briefing">
            <Ionicons name="refresh" size={17} color={theme.accent} />
          </Pressable>
        </View>
        <Text style={styles.digest}>
          {wx ? `${wx.condition} at ${wx.temp}${degree}${unit}; ${wx.high}${degree}/${wx.low}${degree} today. ` : "Compiling conditions. "}
          {active.length ? `${active.length} active operation${active.length === 1 ? "" : "s"}; ${active[0].title.toLowerCase()} is on deck. ` : "The active lane is clear — promote one queue item when ready. "}
          {messages ? `${messages} instruction${messages === 1 ? "" : "s"} logged across the fleet. ` : "Comms is open for a first instruction. "}
          {gdata ? `${gdata.unread} unread in inbox; ${gdata.events.length} event${gdata.events.length === 1 ? "" : "s"} on today's calendar. ` : ""}
          {credentials ? "The paired Hermes gateway is ready for live sessions." : "The fleet is in demo mode until a gateway is paired."}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle}>SCHEDULE</Text>
          <Text style={[styles.badge, gdata && { color: theme.success }]}>{gdata ? "● GOOGLE CALENDAR" : "DEMO AGENDA"}</Text>
        </View>
        {gdata ? (
          gdata.events.length ? (
            gdata.events.map((e, i) => (
              <View key={`${e.time}-${i}`} style={styles.scheduleRow}>
                <Text style={styles.scheduleTime}>{e.time}</Text>
                <Text style={styles.scheduleTitle}>{e.summary}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.cardHint}>No events on your calendar today.</Text>
          )
        ) : (
          <>
            <View style={styles.scheduleRow}><Text style={styles.scheduleTime}>09:30</Text><Text style={styles.scheduleTitle}>Clear dispatch and choose an active operation</Text></View>
            <View style={styles.scheduleRow}><Text style={styles.scheduleTime}>14:00</Text><Text style={styles.scheduleTitle}>Review live Hermes session output</Text></View>
            <Pressable onPress={() => navigate({ name: "hub-settings" })}><Text style={styles.setupText}>CONNECT GOOGLE FOR YOUR REAL AGENDA →</Text></Pressable>
          </>
        )}
        {!!gdata?.tasks.length && (
          <View style={styles.tasksBlock}>
            <Text style={styles.tasksLabel}>OPEN TASKS · {gdata.tasks.length}</Text>
            {gdata.tasks.slice(0, 3).map((t, i) => (
              <Text key={`${t}-${i}`} style={styles.taskLine}>• {t}</Text>
            ))}
          </View>
        )}
      </View>

      <View style={styles.weatherCard}>
        <View>
          <Text style={styles.cardTitle}>ATMOSPHERICS</Text>
          <Text style={styles.weatherTemp}>{wx?.temp ?? "—"}{degree}</Text>
          <Text style={styles.condition}>{wx?.condition ?? "UPDATING"}</Text>
        </View>
        <View style={styles.weatherStats}>
          <Text style={styles.weatherStat}>HI/LO  {wx ? `${wx.high}${degree}/${wx.low}${degree}` : "—"}</Text>
          <Text style={styles.weatherStat}>WIND   {wx ? `${wx.wind} ${unit === "F" ? "MPH" : "KM/H"}` : "—"}</Text>
          <Text style={styles.weatherStat}>HUMID  {wx ? `${wx.humidity}%` : "—"}</Text>
          <Text style={[styles.weatherStatus, { color: wx?.live ? theme.success : theme.warning }]}>{wx?.live ? "● LIVE FIX" : "● DEMO FIX"}</Text>
        </View>
      </View>
      {!city && <Pressable style={styles.setupLine} onPress={() => navigate({ name: "hub-settings" })}><Text style={styles.setupText}>SET A CITY FOR LIVE WEATHER →</Text></Pressable>}

      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle}>OPS BOARD PULSE</Text>
          <Pressable onPress={() => navigate({ name: "board" })}><Text style={styles.action}>OPEN →</Text></Pressable>
        </View>
        <Text style={styles.opsCount}>{queue.length} QUEUED · {active.length} ACTIVE · {shipped.length} SHIPPED</Text>
        <Text style={styles.opsTask}>{active[0]?.title ?? queue[0]?.title ?? "No work on the board yet."}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle}>SIGNAL WATCH</Text>
          <Pressable onPress={() => navigate({ name: "wire" })}><Text style={styles.action}>FULL WIRE →</Text></Pressable>
        </View>
        <Text style={styles.signalTitle}>National, international, and local stories are one tap away.</Text>
        <Text style={styles.cardHint}>The wire attempts live data first and labels its fallback state when the source is unavailable.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>FLEET STATUS</Text>
        {["HERMES", "OPENAI", "CLAUDE"].map((name, index) => (
          <View key={name} style={styles.fleetRow}>
            <View style={[styles.fleetDot, { backgroundColor: index === 0 && credentials ? theme.success : theme.warning }]} />
            <Text style={styles.fleetName}>{name}</Text>
            <Text style={[styles.fleetState, { color: index === 0 && credentials ? theme.success : theme.warning }]}>{index === 0 && credentials ? "ONLINE // GATEWAY" : "STANDBY // DEMO"}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  content: { padding: theme.spacing(4), paddingBottom: theme.spacing(5), gap: theme.spacing(3) },
  date: { color: theme.muted, fontSize: 11, fontFamily: theme.mono, letterSpacing: 0.8 },
  greeting: { color: theme.text, fontSize: 23, fontFamily: theme.display, letterSpacing: 0.6, marginTop: 4 },
  callsign: { color: theme.accent, fontSize: 24, fontFamily: theme.display, letterSpacing: 0.6, marginTop: -2 },
  cursor: { color: theme.accent },
  card: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, padding: theme.spacing(3), gap: theme.spacing(2) },
  leadCard: { borderColor: theme.accentDim, backgroundColor: "#1E2533" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: theme.spacing(2) },
  cardKicker: { color: theme.accent, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.6 },
  iconButton: { minHeight: 38, minWidth: 38, alignItems: "center", justifyContent: "center" },
  digest: { color: theme.text, fontSize: 15, lineHeight: 23 },
  cardTitle: { color: theme.text, fontFamily: theme.mono, fontSize: 11, letterSpacing: 0.65 },
  badge: { color: theme.warning, fontFamily: theme.mono, fontSize: 10 },
  scheduleRow: { flexDirection: "row", gap: theme.spacing(3), alignItems: "center" },
  scheduleTime: { color: theme.accent, fontFamily: theme.mono, fontSize: 11, width: 60 },
  scheduleTitle: { color: theme.text, fontSize: 14, flex: 1 },
  cardHint: { color: theme.muted, fontSize: 12, lineHeight: 18 },
  tasksBlock: { borderTopWidth: 1, borderTopColor: theme.borderDim, paddingTop: theme.spacing(2), gap: 4 },
  tasksLabel: { color: theme.muted, fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.6 },
  taskLine: { color: theme.text, fontSize: 13, lineHeight: 19 },
  weatherCard: { flexDirection: "row", justifyContent: "space-between", backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, padding: theme.spacing(3) },
  weatherTemp: { color: theme.text, fontSize: 45, fontFamily: theme.fontFamilyBold, lineHeight: 54, marginTop: 4 },
  condition: { color: theme.accent, fontSize: 14, fontFamily: theme.fontFamilyMedium },
  weatherStats: { justifyContent: "flex-end", gap: 6, alignItems: "flex-end" },
  weatherStat: { color: theme.muted, fontSize: 10, fontFamily: theme.mono },
  weatherStatus: { fontSize: 10, fontFamily: theme.mono, marginTop: 4 },
  setupLine: { minHeight: 36, justifyContent: "center", paddingHorizontal: theme.spacing(2) },
  setupText: { color: theme.accent, fontSize: 10, fontFamily: theme.mono, letterSpacing: 0.5 },
  action: { color: theme.accent, fontSize: 10, fontFamily: theme.mono },
  opsCount: { color: theme.accent, fontFamily: theme.mono, fontSize: 11 },
  opsTask: { color: theme.text, fontSize: 14 },
  signalTitle: { color: theme.text, fontSize: 15 },
  fleetRow: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 8 },
  fleetDot: { width: 7, height: 7, borderRadius: 4 },
  fleetName: { color: theme.text, fontSize: 12, fontFamily: theme.fontFamilyMedium, flex: 1 },
  fleetState: { fontSize: 10, fontFamily: theme.mono },
});
