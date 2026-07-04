/** Root stack: pre-tabs states (auth, onboarding), then the tabbed app. */
export type RootStackParamList = {
  Login: undefined;
  Onboarding: undefined;
  MainTabs: undefined;
  // Root-level (not nested under Games) so it's reachable both from deep in
  // the Games tab (join button) and from the global "opponent joined" push.
  Battleship: { roomId: string };
};

/** Bottom tabs shown once the user is authenticated and onboarded. */
export type MainTabParamList = {
  Games: undefined;
  Wallet: undefined;
  History: undefined;
  Profile: undefined;
  DemoGames: undefined;
};

/** Nested stack behind the Games tab. */
export type GamesStackParamList = {
  GamesList: undefined;
};
