import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import * as Calendar from "expo-calendar";
import { theme } from "@hermes-mobile/ui";
import { TabBar } from "../components/TabBar";

const WMO: Record<number, string> = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog",
  51: "Drizzle", 53: "Drizzle", 55: "Drizzle", 61: "Rain", 63: "Rain", 65: "Heavy rain",
  71: "Snow", 73: "Snow", 75: "Heavy snow", 80: "Showers", 81: "Showers", 82: "Heavy showers",
  95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm",
};

async function getPosition(): Promise<{ lat: number; lon: number }> {
  if (Platform.OS === "web") {
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
        (e) => reject(new Error(e.message)),
        { timeout: 10000, maximumAge: 600000 },
      ),
    );
  }
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) throw new Error("location permission denied — enable it in system settings");
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: pos.coords.latitude, lon: pos.coords.longitude };
}

async function getWeather() {
  const { lat, lon } = await getPosition();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
  const res = await fetch(url, { signal: AbortSignal.timeout(11000) });
  if (!res.ok) throw new Error("weather unavailable");
  const d = (await res.json()) as {
    current: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; weather_code: number; wind_speed_10m: number };
    daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[] };
  };
  return {
    temp: Math.round(d.current.temperature_2m),
    feels: Math.round(d.current.apparent_temperature),
    cond: WMO[d.current.weather_code] ?? "—",
    hi: Math.round(d.daily.temperature_2m_max[0]),
    lo: Math.round(d.daily.temperature_2m_min[0]),
    wind: Math.round(d.current.wind_speed_10m),
    humid: d.current.relative_humidity_2m,
    rain: d.daily.precipitation_probability_max[0] ?? 0,
  };
}

async function getEvents() {
  if (Platform.OS === "web") return { unsupported: true as const, events: [] };
  const perm = await Calendar.requestCalendarPermissionsAsync();
  if (!perm.granted) throw new Error("calendar permission denied — enable it in system settings");
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const events = await Calendar.getEventsAsync(cals.map((c) => c.id), start, end);
  return {
    unsupported: false as const,
    events: events
      .sort((a, b) => +new Date(a.startDate as string) - +new Date(b.startDate as string))
      .slice(0, 10)
      .map((e) => ({
        id: e.id,
        title: e.title || "Untitled",
        allDay: e.allDay,
        time: e.allDay
          ? "ALL DAY"
          : new Date(e.startDate as string).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      })),
  };
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5 || h >= 21) return "Night watch";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Daily brief: weather at your location + today's calendar. */
export function TodayScreen() {
  const wx = useQuery({ queryKey: ["weather"], queryFn: getWeather, staleTime: 15 * 60_000, retry: 0 });
  const cal = useQuery({ queryKey: ["calendar"], queryFn: getEvents, staleTime: 5 * 60_000, retry: 0 });
  const dateStr = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>{greeting()}, operator</Text>
        <Text style={styles.sub}>{dateStr}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: theme.spacing(3), gap: theme.spacing(3) }}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Weather</Text>
          {wx.isLoading && <ActivityIndicator color={theme.accent} />}
          {!!wx.error && <Text style={styles.err}>{(wx.error as Error).message}</Text>}
          {!!wx.data && (
            <>
              <View style={styles.wxTop}>
                <Text style={styles.temp}>{wx.data.temp}°</Text>
                <View>
                  <Text style={styles.cond}>{wx.data.cond}</Text>
                  <Text style={styles.meta}>
                    H {wx.data.hi}° · L {wx.data.lo}° · feels {wx.data.feels}°
                  </Text>
                </View>
              </View>
              <Text style={styles.meta}>
                wind {wx.data.wind} mph · humidity {wx.data.humid}% · rain {wx.data.rain}%
              </Text>
            </>
          )}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Today’s schedule</Text>
          {cal.isLoading && <ActivityIndicator color={theme.accent} />}
          {!!cal.error && <Text style={styles.err}>{(cal.error as Error).message}</Text>}
          {cal.data?.unsupported && (
            <Text style={styles.meta}>
              Calendar needs the installed Android app — grant calendar access on the device and
              today’s events appear here.
            </Text>
          )}
          {cal.data && !cal.data.unsupported && cal.data.events.length === 0 && (
            <Text style={styles.meta}>Nothing scheduled today.</Text>
          )}
          {cal.data?.events.map((e) => (
            <View key={e.id} style={styles.evRow}>
              <Text style={styles.evTime}>{e.time}</Text>
              <Text style={styles.evTitle} numberOfLines={1}>
                {e.title}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <TabBar active="today" />
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
  sub: { color: theme.muted, fontSize: theme.font.small, marginTop: 2 },
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing(3),
    gap: theme.spacing(2),
  },
  cardTitle: { color: theme.text, fontWeight: "700", fontFamily: theme.fontFamily },
  wxTop: { flexDirection: "row", alignItems: "center", gap: theme.spacing(4) },
  temp: { color: theme.text, fontSize: 44, fontWeight: "700", fontFamily: theme.fontFamily },
  cond: { color: theme.accent, fontSize: theme.font.body, fontWeight: "600" },
  meta: { color: theme.muted, fontSize: theme.font.small, lineHeight: 18 },
  evRow: { flexDirection: "row", gap: theme.spacing(3), alignItems: "center" },
  evTime: { color: theme.accent, fontSize: theme.font.small, fontWeight: "700", width: 64 },
  evTitle: { color: theme.text, fontSize: theme.font.body, flex: 1 },
  err: { color: theme.error, fontSize: theme.font.small },
});
