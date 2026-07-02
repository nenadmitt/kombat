/** Root stack: pre-tabs states (auth, onboarding), then the tabbed app. */
export type RootStackParamList = {
  Login: undefined;
  Onboarding: undefined;
  MainTabs: undefined;
};

/** Bottom tabs shown once the user is authenticated and onboarded. */
export type MainTabParamList = {
  Games: undefined;
  Wallet: undefined;
  History: undefined;
  Profile: undefined;
};

/** Nested stack behind the Games tab — the only tab with more than one screen. */
export type GamesStackParamList = {
  GamesList: undefined;
  Battleship: undefined;
};
