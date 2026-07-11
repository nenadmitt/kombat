import type { StakeAsset } from '@gaming-platform/core';

/** Root stack: pre-tabs states (auth, onboarding), then the tabbed app. */
export type RootStackParamList = {
  Login: undefined;
  Onboarding: undefined;
  MainTabs: undefined;
  // Root-level (not nested under Games) so it's reachable both from deep in
  // the Games tab (join button) and from the global "opponent joined" push.
  // Stake fields ride along (when known) so the result screen can show the
  // pot without another fetch.
  Battleship: {
    roomId: string;
    stakeToken?: StakeAsset | null;
    stakeAmount?: string | null;
  };
  // Demo/preview of the fleet-deployment UI, reachable from the Demo Games
  // tab — not part of the real room/join flow.
  BattleshipSetup: undefined;
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
