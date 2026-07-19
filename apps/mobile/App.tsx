import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { theme } from "@hermes-mobile/ui";
import { ChatScreen } from "./src/screens/ChatScreen";
import { PairScreen } from "./src/screens/PairScreen";
import { SessionsScreen } from "./src/screens/SessionsScreen";
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
        ) : (
          <ChatScreen route={route} />
        )}
      </View>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
});
