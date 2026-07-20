import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_700Bold,
  useFonts,
} from "@expo-google-fonts/ibm-plex-sans";
import { theme } from "@hermes-mobile/ui";
import { Drawer } from "./src/components/Drawer";
import { ChatScreen } from "./src/screens/ChatScreen";
import { FilesScreen } from "./src/screens/FilesScreen";
import { FileViewScreen } from "./src/screens/FileViewScreen";
import { InsightsScreen } from "./src/screens/InsightsScreen";
import { MarketsScreen } from "./src/screens/MarketsScreen";
import { NewsScreen } from "./src/screens/NewsScreen";
import { PairScreen } from "./src/screens/PairScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { SessionsScreen } from "./src/screens/SessionsScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { SkillsScreen } from "./src/screens/SkillsScreen";
import { TasksScreen } from "./src/screens/TasksScreen";
import { TerminalScreen } from "./src/screens/TerminalScreen";
import { TodayScreen } from "./src/screens/TodayScreen";
import { useApp, type TabName } from "./src/store";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

export default function App() {
  const hydrated = useApp((s) => s.hydrated);
  const route = useApp((s) => s.route);
  const hydrate = useApp((s) => s.hydrate);
  // Fonts render with the system sans until loaded; no splash gate needed.
  useFonts({ IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_700Bold });

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const activeTab: TabName =
    route.name === "chat" ? "sessions" : route.name === "file" ? "files" : (route.name as TabName);

  return (
    <QueryClientProvider client={queryClient}>
      <View style={styles.root}>
        <StatusBar style="light" />
        {!hydrated ? null : route.name === "pair" ? (
          <PairScreen />
        ) : (
          <>
            {route.name === "sessions" ? (
              <SessionsScreen />
            ) : route.name === "chat" ? (
              <ChatScreen route={route} />
            ) : route.name === "files" ? (
              <FilesScreen path={route.path} />
            ) : route.name === "file" ? (
              <FileViewScreen path={route.path} />
            ) : route.name === "tasks" ? (
              <TasksScreen />
            ) : route.name === "skills" ? (
              <SkillsScreen />
            ) : route.name === "insights" ? (
              <InsightsScreen />
            ) : route.name === "today" ? (
              <TodayScreen />
            ) : route.name === "news" ? (
              <NewsScreen />
            ) : route.name === "markets" ? (
              <MarketsScreen />
            ) : route.name === "profile" ? (
              <ProfileScreen />
            ) : route.name === "terminal" ? (
              <TerminalScreen />
            ) : (
              <SettingsScreen />
            )}
            <Drawer active={activeTab} />
          </>
        )}
      </View>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
});
