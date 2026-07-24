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
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";
import { ChakraPetch_600SemiBold, ChakraPetch_700Bold } from "@expo-google-fonts/chakra-petch";
import { theme } from "@hermes-mobile/ui";
import { Drawer } from "./src/components/Drawer";
import { HubShell, type HubTab } from "./src/hub/HubShell";
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
import { SshScreen } from "./src/screens/SshScreen";
import { TasksScreen } from "./src/screens/TasksScreen";
import { TerminalScreen } from "./src/screens/TerminalScreen";
import { TodayScreen } from "./src/screens/TodayScreen";
import { BoardScreen } from "./src/screens/hub/BoardScreen";
import { BriefScreen } from "./src/screens/hub/BriefScreen";
import { CommsScreen } from "./src/screens/hub/CommsScreen";
import { HubSettingsScreen } from "./src/screens/hub/HubSettingsScreen";
import { ModulesScreen } from "./src/screens/hub/ModulesScreen";
import { WireScreen } from "./src/screens/hub/WireScreen";
import { useApp, useHub, type Route, type TabName } from "./src/store";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

const HUB_TABS: HubTab[] = ["comms", "brief", "wire", "board", "modules", "hub-settings"];
const isHubRoute = (route: Route): route is { name: HubTab } =>
  (HUB_TABS as string[]).includes(route.name);

/** The HUBB command surface: shared chrome + the active hub screen. */
function HubRouter({ tab }: { tab: HubTab }) {
  return (
    <HubShell active={tab}>
      {tab === "comms" ? (
        <CommsScreen />
      ) : tab === "brief" ? (
        <BriefScreen />
      ) : tab === "wire" ? (
        <WireScreen />
      ) : tab === "board" ? (
        <BoardScreen />
      ) : tab === "modules" ? (
        <ModulesScreen />
      ) : (
        <HubSettingsScreen />
      )}
    </HubShell>
  );
}

export default function App() {
  const hydrated = useApp((s) => s.hydrated);
  const route = useApp((s) => s.route);
  const hydrate = useApp((s) => s.hydrate);
  const hydrateHub = useHub((s) => s.hydrateHub);
  // Fonts render with the system faces until loaded; no splash gate needed.
  useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    ChakraPetch_600SemiBold,
    ChakraPetch_700Bold,
  });

  useEffect(() => {
    void hydrate();
    void hydrateHub();
  }, [hydrate, hydrateHub]);

  const activeTab: TabName =
    route.name === "chat" ? "sessions" : route.name === "file" ? "files" : (route.name as TabName);

  return (
    <QueryClientProvider client={queryClient}>
      <View style={styles.root}>
        <StatusBar style="light" />
        {!hydrated ? null : isHubRoute(route) ? (
          <HubRouter tab={route.name} />
        ) : route.name === "pair" ? (
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
            ) : route.name === "ssh" ? (
              <SshScreen />
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
