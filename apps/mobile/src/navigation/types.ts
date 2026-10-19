import type { StakeAsset } from '@gaming-platform/core';

export type RootStackParamList = {
  Login: undefined;
  Onboarding: undefined;
  MainTabs: undefined;
  Battleship: {
    roomId: string;
    stakeToken?: StakeAsset | null;
    stakeAmount?: string | null;
  };
  BattleshipSetup: undefined;
  Ludo: {
    roomId: string;
    stakeToken?: StakeAsset | null;
    stakeAmount?: string | null;
  };
  LudoSetup: undefined;
  TripleCut: {
    roomId: string;
    stakeToken?: StakeAsset | null;
    stakeAmount?: string | null;
  };
  TripleCutSetup: undefined;
  ChromaClash: {
    roomId: string;
    stakeToken?: StakeAsset | null;
    stakeAmount?: string | null;
  };
  ChromaClashSetup: undefined;
  Salvo: {
    roomId: string;
    stakeToken?: StakeAsset | null;
    stakeAmount?: string | null;
  };
  SalvoSetup: undefined;
};

export type MainTabParamList = {
  Games: undefined;
  Wallet: undefined;
  History: undefined;
  Profile: undefined;
  DemoGames: undefined;
};

export type GamesStackParamList = {
  GamesList: undefined;
};
