import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { theme } from "@hermes-mobile/ui";
import { ChatScreen } from "./src/screens/ChatScreen";
import { FilesScreen } from "./src/screens/FilesScreen";
import { FileViewScreen } from "./src/screens/FileViewScreen";
import { InsightsScreen } from "./src/screens/InsightsScreen";
import { PairScreen } from "./src/screens/PairScreen";
import { SessionsScreen } from "./src/screens/SessionsScreen";
import { SkillsScreen } from "./src/screens/SkillsScreen";
import { TasksScreen } from "./src/screens/TasksScreen";
import { useApp } from "./src/store";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

export default function App() {
  const hydrated = useApp((s) => s.hydrated);
  const route = useApp((s) => s.route);
  const hydrate = useApp((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <QueryClientProvider client={queryClient}>
      <View style={styles.root}>
        <StatusBar style="light" />
        {!hydrated ? null : route.name === "pair" ? (
          <PairScreen />
        ) : route.name === "sessions" ? (
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
        ) : (
          <InsightsScreen />
        )}
      </View>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
});
