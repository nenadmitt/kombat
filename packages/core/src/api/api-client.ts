import type {
  AuthSession,
  ExchangeTokenResponse,
  PublicUserProfile,
  UserProfile,
} from '../authentication/authentication.types';
import type { AppPlatform } from '../authentication/platform.types';
import type { PlayerStats } from '../players/player-stats';
import type { RankingEntry, RankingsQuery } from '../players/rankings';
import type {
  GameRoomSummary,
  GameType,
  LobbyRoomFilters,
} from '../games/game-room.types';
import type {
  MatchHistoryEntry,
  StakeAsset,
  WalletBalances,
} from '../games/stake.types';
import type {
  StakePotBalances,
  StakePotDepositTarget,
  StakePotHistoryEntry,
  StakePotWithdrawalResponse,
} from '../games/stake-pot.types';
import type { BattleshipRoomState } from '../games/battleship/battleship.protocol';
import type { LudoRoomState } from '../games/ludo/ludo.protocol';
import type { RpsRoomState } from '../games/rps/rps.protocol';
import type { SalvoRoomState } from '../games/salvo/salvo.protocol';
import type { ChromaRoomState } from '../games/chroma/chroma.protocol';
import type {
  CreateWalletResponse,
  WalletNetwork,
  WalletSummary,
} from '../wallets/wallet.types';
import type { PlatformStatus } from '../platform/platform-status';
import { ErrorCode } from './error-codes';

export type ApiClientOptions = {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null>;
  getRefreshToken?: () => Promise<string | null>;
  onSessionRefreshed?: (session: AuthSession) => Promise<void>;
  onSessionExpired?: () => Promise<void>;
  timeoutMs?: number;
  appVersion?: string;
  /** `web` is exempt from the server's store-build version floor. */
  appPlatform?: AppPlatform;
};

export class ApiError extends Error {
  constructor(
    /** 0 when no response was received (network failure or timeout). */
    public readonly status: number,
    message: string,
    public readonly code: string = ErrorCode.Unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export class ApiClient {
  private static readonly API_PREFIX = '/api/v1';

  constructor(private readonly options: ApiClientOptions) {}

  getPlatformStatus(): Promise<PlatformStatus> {
    return this.request('GET', '/status', undefined, false, false);
  }

  requestLoginToken(email: string): Promise<void> {
    return this.request('POST', '/authentication/request-token', { email });
  }

  exchangeLoginToken(
    email: string,
    token: string,
  ): Promise<ExchangeTokenResponse> {
    return this.request('POST', '/authentication/exchange-token', {
      email,
      token,
    });
  }

  requestSiweNonce(): Promise<{ nonce: string }> {
    return this.request('POST', '/authentication/siwe/nonce', {});
  }

  verifySiwe(message: string, signature: string): Promise<AuthSession> {
    return this.request('POST', '/authentication/siwe/verify', {
      message,
      signature,
    });
  }

  refreshSession(refreshToken: string): Promise<AuthSession> {
    return this.request('POST', '/authentication/refresh', { refreshToken });
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      await this.request('POST', '/authentication/logout', { refreshToken });
    } catch {
      // Best effort: the local session is cleared regardless.
    }
  }

  createWallet(network: WalletNetwork): Promise<CreateWalletResponse> {
    return this.request('POST', '/wallets', { network }, true);
  }

  getEmbeddedWalletKey(): Promise<{ address: string; privateKey: string }> {
    return this.request('GET', '/wallets/embedded-key', undefined, true);
  }

  listWallets(): Promise<WalletSummary[]> {
    return this.request('GET', '/wallets', undefined, true);
  }

  getCurrentUser(): Promise<UserProfile> {
    return this.request('GET', '/users/me', undefined, true);
  }

  /** `referredByCode` is honoured only once; attribution is write-once server-side. */
  updateUsername(
    username: string,
    referredByCode?: string,
  ): Promise<UserProfile> {
    return this.request(
      'PATCH',
      '/users/me/username',
      referredByCode ? { username, referredByCode } : { username },
      true,
    );
  }

  getMyStats(): Promise<PlayerStats> {
    return this.request('GET', '/users/me/stats', undefined, true);
  }

  getUserProfiles(ids: string[]): Promise<PublicUserProfile[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.request(
      'GET',
      `/users/profiles?ids=${encodeURIComponent(ids.join(','))}`,
      undefined,
      true,
    );
  }

  getRankings(query?: RankingsQuery): Promise<RankingEntry[]> {
    const params = new URLSearchParams();
    if (query?.gameType !== undefined) {
      params.set('gameType', String(query.gameType));
    }
    if (query?.limit !== undefined) {
      params.set('limit', String(query.limit));
    }
    if (query?.offset !== undefined) {
      params.set('offset', String(query.offset));
    }
    const search = params.toString();
    return this.request(
      'GET',
      `/rankings${search ? `?${search}` : ''}`,
      undefined,
      false,
    );
  }

  createGameRoom(
    gameType: GameType,
    /** Base units; omit for a free game. */
    stake?: { token: StakeAsset; amount: string },
    isPrivate = false,
  ): Promise<GameRoomSummary> {
    return this.request(
      'POST',
      '/games/rooms',
      {
        gameType,
        isPrivate,
        ...(stake ? { stakeToken: stake.token, stakeAmount: stake.amount } : {}),
      },
      true,
    );
  }

  getGameRoomByCode(code: string): Promise<GameRoomSummary> {
    return this.request(
      'GET',
      `/games/rooms/by-code/${encodeURIComponent(code.trim().toUpperCase())}`,
      undefined,
      true,
    );
  }

  getMatchHistory(options?: {
    limit?: number;
    offset?: number;
  }): Promise<MatchHistoryEntry[]> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options?.offset !== undefined) {
      params.set('offset', String(options.offset));
    }
    const query = params.toString();
    return this.request(
      'GET',
      `/games/rooms/history${query ? `?${query}` : ''}`,
      undefined,
      true,
    );
  }

  getWalletBalances(): Promise<WalletBalances> {
    return this.request('GET', '/wallets/balances', undefined, true);
  }

  getStakePotBalances(): Promise<StakePotBalances> {
    return this.request('GET', '/stake-pot/balances', undefined, true);
  }

  getStakePotHistory(limit?: number): Promise<StakePotHistoryEntry[]> {
    return this.request(
      'GET',
      `/stake-pot/history${limit ? `?limit=${limit}` : ''}`,
      undefined,
      true,
    );
  }

  withdrawFromStakePot(
    asset: StakeAsset,
    amount: string,
  ): Promise<StakePotWithdrawalResponse> {
    return this.request('POST', '/stake-pot/withdraw', { asset, amount }, true);
  }

  getStakePotDepositTarget(): Promise<StakePotDepositTarget> {
    return this.request('GET', '/stake-pot/deposit-target', undefined, true);
  }

  /** `amount` is base units, unlike the claim response. */
  getWelcomeBonus(): Promise<{
    available: boolean;
    amount: string;
    symbol: string;
  }> {
    return this.request('GET', '/stake-pot/welcome-bonus', undefined, true);
  }

  claimWelcomeBonus(): Promise<{
    txHash: string;
    amount: string;
    symbol: string;
  }> {
    return this.request('POST', '/stake-pot/claim', {}, true);
  }

  listPendingGameRooms(options?: {
    excludeOwn?: boolean;
    filters?: LobbyRoomFilters;
  }): Promise<GameRoomSummary[]> {
    const params: string[] = [];
    if (options?.excludeOwn) {
      params.push('excludeOwn=true');
    }
    const f = options?.filters;
    if (f?.gameTypes?.length) {
      params.push(`gameTypes=${f.gameTypes.join(',')}`);
    }
    if (f?.stake && f.stake !== 'all') {
      params.push(`stake=${f.stake}`);
    }
    if (f?.stakeTokens?.length) {
      params.push(`stakeTokens=${f.stakeTokens.join(',')}`);
    }
    const query = params.length ? `?${params.join('&')}` : '';
    return this.request('GET', `/games/rooms${query}`, undefined, true);
  }

  closeGameRoom(id: string): Promise<{ success: true }> {
    return this.request('DELETE', `/games/rooms/${id}`, undefined, true);
  }

  forfeitGameRoom(id: string): Promise<{ winnerUserId: string | null }> {
    return this.request('POST', `/games/rooms/${id}/forfeit`, undefined, true);
  }

  /** A stable-staked room accepts any stablecoin 1:1. */
  joinGameRoom(id: string, stakeToken?: StakeAsset): Promise<GameRoomSummary> {
    return this.request(
      'POST',
      `/games/rooms/${id}/join`,
      stakeToken === undefined ? undefined : { stakeToken },
      true,
    );
  }

  startGameRoom(id: string): Promise<GameRoomSummary> {
    return this.request('POST', `/games/rooms/${id}/start`, undefined, true);
  }

  leaveGameRoom(id: string): Promise<{ success: true }> {
    return this.request('POST', `/games/rooms/${id}/leave`, undefined, true);
  }

  getMyActiveGameRoom(): Promise<GameRoomSummary | null> {
    return this.request('GET', '/games/rooms/mine', undefined, true);
  }

  getBattleshipRoomState(roomId: string): Promise<BattleshipRoomState> {
    return this.request('GET', `/games/rooms/${roomId}/state`, undefined, true);
  }

  getLudoRoomState(roomId: string): Promise<LudoRoomState> {
    return this.request('GET', `/games/rooms/${roomId}/state`, undefined, true);
  }

  getSalvoRoomState(roomId: string): Promise<SalvoRoomState> {
    return this.request('GET', `/games/rooms/${roomId}/state`, undefined, true);
  }

  getRpsRoomState(roomId: string): Promise<RpsRoomState> {
    return this.request('GET', `/games/rooms/${roomId}/state`, undefined, true);
  }

  getChromaRoomState(roomId: string): Promise<ChromaRoomState> {
    return this.request('GET', `/games/rooms/${roomId}/state`, undefined, true);
  }

  // Shared so concurrent 401s spend the rotating refresh token only once.
  private refreshInFlight: Promise<boolean> | null = null;

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    authenticated = false,
    versioned = true,
    isRetry = false,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.options.appVersion) {
      headers['X-App-Version'] = this.options.appVersion;
    }
    if (this.options.appPlatform) {
      headers['X-App-Platform'] = this.options.appPlatform;
    }
    if (authenticated) {
      const token = await this.options.getAccessToken?.();
      if (!token) {
        throw new ApiError(401, 'Not authenticated');
      }
      headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 10000,
    );

    let response: Response;
    try {
      const prefix = versioned ? ApiClient.API_PREFIX : '';
      response = await fetch(`${this.options.baseUrl}${prefix}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'AbortError';
      throw new ApiError(
        0,
        timedOut
          ? 'The request timed out. Check your connection and try again.'
          : 'Could not reach the server. Check your connection and try again.',
        ErrorCode.NetworkFailed,
      );
    } finally {
      clearTimeout(timeout);
    }

    const isJson = response.headers
      .get('content-type')
      ?.includes('application/json');
    const data: unknown = isJson ? await response.json() : undefined;

    if (!response.ok) {
      if (
        response.status === 401 &&
        authenticated &&
        !isRetry &&
        (await this.refreshSessionOnce())
      ) {
        return this.request<T>(
          method,
          path,
          body,
          authenticated,
          versioned,
          true,
        );
      }

      const errorBody =
        data && typeof data === 'object'
          ? (data as { message?: unknown; error?: unknown; code?: unknown })
          : undefined;
      const message =
        errorBody?.message?.toString() ??
        errorBody?.error?.toString() ??
        response.statusText;
      const code = errorBody?.code?.toString() ?? ErrorCode.Unknown;
      throw new ApiError(response.status, message, code);
    }

    return data as T;
  }

  private refreshSessionOnce(): Promise<boolean> {
    this.refreshInFlight ??= this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = await this.options.getRefreshToken?.();
    if (!refreshToken) {
      await this.options.onSessionExpired?.();
      return false;
    }
    try {
      const session = await this.refreshSession(refreshToken);
      await this.options.onSessionRefreshed?.(session);
      return true;
    } catch (error) {
      // A network blip must not sign the user out.
      if (error instanceof ApiError && error.status === 0) {
        return false;
      }
      await this.options.onSessionExpired?.();
      return false;
    }
  }
}
