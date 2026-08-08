import type {
  AuthSession,
  ExchangeTokenResponse,
  PublicUserProfile,
  UserProfile,
} from '../authentication/authentication.types';
import type { AppPlatform } from '../authentication/platform.types';
import type { PlayerStats } from '../players/player-stats';
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
  /** Injected by the consumer — core stays platform-agnostic (no AsyncStorage/Keychain here). */
  getAccessToken?: () => Promise<string | null>;
  /** The stored refresh token. Without it, an expired access token is fatal. */
  getRefreshToken?: () => Promise<string | null>;
  /** Persist a rotated pair. Called before the original request is retried. */
  onSessionRefreshed?: (session: AuthSession) => Promise<void>;
  /** The refresh token is gone or rejected: the user has to log in again. */
  onSessionExpired?: () => Promise<void>;
  /** Request timeout in ms before it's treated as a network failure. Defaults to 10000. */
  timeoutMs?: number;
  /** Client build version, sent as X-App-Version so the server can gate old builds. */
  appVersion?: string;
  /** Sent as X-App-Platform. `web` is exempt from the store-build version
   *  floor, and the server pins new accounts to the app that created them. */
  appPlatform?: AppPlatform;
};

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 for a network failure/timeout (no response was received at all). */
    public readonly status: number,
    message: string,
    /** Backend-provided error code, or ErrorCode.Unknown/.NetworkFailed when none applies. */
    public readonly code: string = ErrorCode.Unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the request never reached the server (offline, unreachable, timed out). */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/** Thin fetch wrapper for the gaming-platform server API, shared between mobile and (later) web. */
export class ApiClient {
  /** All server routes are versioned under this prefix except `/health`. */
  private static readonly API_PREFIX = '/api/v1';

  constructor(private readonly options: ApiClientOptions) {}

  /**
   * Public platform status (maintenance flag). Unversioned like `/health`.
   * Doubles as the offline-recovery probe: any response proves the server is
   * reachable again, and carries the maintenance state in the same trip.
   */
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

  /** Nonce to embed in the SIWE message. Single-use, expires in minutes. */
  requestSiweNonce(): Promise<{ nonce: string }> {
    return this.request('POST', '/authentication/siwe/nonce', {});
  }

  /** Exchange a signed EIP-4361 message for a session. */
  verifySiwe(message: string, signature: string): Promise<AuthSession> {
    return this.request('POST', '/authentication/siwe/verify', {
      message,
      signature,
    });
  }

  /**
   * Trade a refresh token for a new pair. Callers rarely need this directly -
   * `request` drives it automatically when an access token has expired.
   */
  refreshSession(refreshToken: string): Promise<AuthSession> {
    return this.request('POST', '/authentication/refresh', { refreshToken });
  }

  /** Revoke a session server-side. Never throws - logout must always finish. */
  async logout(refreshToken: string): Promise<void> {
    try {
      await this.request('POST', '/authentication/logout', { refreshToken });
    } catch {
      // The local session is being cleared regardless; a failed revoke just
      // leaves a row that expires on its own.
    }
  }

  createWallet(network: WalletNetwork): Promise<CreateWalletResponse> {
    return this.request('POST', '/wallets', { network }, true);
  }

  listWallets(): Promise<WalletSummary[]> {
    return this.request('GET', '/wallets', undefined, true);
  }

  getCurrentUser(): Promise<UserProfile> {
    return this.request('GET', '/users/me', undefined, true);
  }

  /** `referredByCode` is only honoured the first time; attribution is
   *  write-once server-side. */
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

  /** Lifetime record (games, wins, staked net, referrals) for the profile. */
  getMyStats(): Promise<PlayerStats> {
    return this.request('GET', '/users/me/stats', undefined, true);
  }

  /** Batch-resolve public profiles (username/avatar) for a set of user ids.
   *  Unknown ids are simply omitted from the result. */
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

  createGameRoom(
    gameType: GameType,
    /** Omit for a free game. Amount is base units (see parseStakeAmount). */
    stake?: { token: StakeAsset; amount: string },
    /** Private rooms are hidden from the lobby; joinable only via their code. */
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

  /**
   * Resolve a shareable room code to its (still-joinable) room. Throws
   * ApiError 404 when no pending room has that code. The caller then joins via
   * the normal joinGameRoom(id) path, so staked-room confirmation still runs.
   */
  getGameRoomByCode(code: string): Promise<GameRoomSummary> {
    return this.request(
      'GET',
      `/games/rooms/by-code/${encodeURIComponent(code.trim().toUpperCase())}`,
      undefined,
      true,
    );
  }

  /**
   * Completed matches (result, stake, prize) for the History screen, newest
   * first. Paginated: pass a `limit` and `offset` to page through the feed
   * (the History screen loads a first page then appends on scroll).
   */
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

  /** On-chain balances for the user's wallet. */
  getWalletBalances(): Promise<WalletBalances> {
    return this.request('GET', '/wallets/balances', undefined, true);
  }

  // ---- stake pot -----------------------------------------------------------

  /** Pooled stake balance: spendable, locked by live matches, withdrawing. */
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

  /**
   * Queue a withdrawal from the pot. The destination is always the caller's
   * own wallet, resolved server-side, so there is nothing to pass.
   */
  withdrawFromStakePot(
    asset: StakeAsset,
    amount: string,
  ): Promise<StakePotWithdrawalResponse> {
    return this.request('POST', '/stake-pot/withdraw', { asset, amount }, true);
  }

  /** Where deposits go: the pot contract, its chain, and the token addresses. */
  getStakePotDepositTarget(): Promise<StakePotDepositTarget> {
    return this.request('GET', '/stake-pot/deposit-target', undefined, true);
  }

  /**
   * Whether the welcome bonus is still on the table for this user, and how
   * much it is worth. `amount` is base units, unlike the claim response.
   */
  getWelcomeBonus(): Promise<{
    available: boolean;
    amount: string;
    symbol: string;
  }> {
    return this.request('GET', '/stake-pot/welcome-bonus', undefined, true);
  }

  /** One-time welcome bonus into the caller's stake pot. 409 once claimed. */
  claimWelcomeBonus(): Promise<{
    txHash: string;
    amount: string;
    symbol: string;
  }> {
    return this.request('POST', '/stake-pot/claim', {}, true);
  }

  listPendingGameRooms(options?: {
    /** Leave out rooms created by the requesting user. */
    excludeOwn?: boolean;
    /** Server-side lobby filters (game types, stake, tokens). */
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

  /** Forfeit an in-progress match. In Ludo the leaver is eliminated and the
   *  winner is set only once a single player remains. */
  forfeitGameRoom(id: string): Promise<{ winnerUserId: string | null }> {
    return this.request('POST', `/games/rooms/${id}/forfeit`, undefined, true);
  }

  joinGameRoom(id: string): Promise<GameRoomSummary> {
    return this.request('POST', `/games/rooms/${id}/join`, undefined, true);
  }

  /** Creator-only early start for a multi-player (Ludo) room. */
  startGameRoom(id: string): Promise<GameRoomSummary> {
    return this.request('POST', `/games/rooms/${id}/start`, undefined, true);
  }

  /** Back out of a still-waiting multi-player (Ludo) room (joiners only). */
  leaveGameRoom(id: string): Promise<{ success: true }> {
    return this.request('POST', `/games/rooms/${id}/leave`, undefined, true);
  }

  /** The current user's own open room, if any — null when they don't have one. */
  getMyActiveGameRoom(): Promise<GameRoomSummary | null> {
    return this.request('GET', '/games/rooms/mine', undefined, true);
  }

  /** The requester's personalized Battleship match state — used to mount/resume. */
  getBattleshipRoomState(roomId: string): Promise<BattleshipRoomState> {
    return this.request('GET', `/games/rooms/${roomId}/state`, undefined, true);
  }

  /** The Ludo match snapshot (same endpoint, Ludo-shaped) — mount/resume. */
  getLudoRoomState(roomId: string): Promise<LudoRoomState> {
    return this.request('GET', `/games/rooms/${roomId}/state`, undefined, true);
  }

  /** The Triple Cut match snapshot (same endpoint, RPS-shaped) — mount/resume. */
  getRpsRoomState(roomId: string): Promise<RpsRoomState> {
    return this.request('GET', `/games/rooms/${roomId}/state`, undefined, true);
  }

  /** The Chroma Clash snapshot (same endpoint, chroma-shaped) — mount/resume. */
  getChromaRoomState(roomId: string): Promise<ChromaRoomState> {
    return this.request('GET', `/games/rooms/${roomId}/state`, undefined, true);
  }

  /**
   * In-flight refresh, shared by every caller that hits a 401 at once.
   *
   * On a cold start half a dozen screens fire at the same moment; without this
   * they would each spend the refresh token, and rotation means only the first
   * would succeed - the rest would look like a stolen token and log the user
   * out. One refresh, everyone awaits it.
   */
  private refreshInFlight: Promise<boolean> | null = null;

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    authenticated = false,
    /** Probe endpoints (`/status`) live outside the /api/v1 prefix. */
    versioned = true,
    /** Set on the one retry after a refresh, so a failure can't loop. */
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
      // Connection refused/unreachable (thrown by fetch itself) and our own
      // abort-on-timeout both land here — neither ever got a response.
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
      // An expired access token is recoverable: rotate the session once and
      // replay. `isRetry` bounds it to a single attempt, so a server that 401s
      // for any other reason fails instead of looping.
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
      // Backend doesn't send `code` yet — falls back to Unknown until it does.
      const code = errorBody?.code?.toString() ?? ErrorCode.Unknown;
      throw new ApiError(response.status, message, code);
    }

    return data as T;
  }

  /**
   * Rotate the session, coalescing concurrent callers onto one attempt.
   * Resolves true when a fresh access token is stored and the caller should
   * retry, false when the user has to log in again.
   */
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
      // A network blip must not sign the user out - only the server actually
      // rejecting the refresh token means the session is really gone.
      if (error instanceof ApiError && error.status === 0) {
        return false;
      }
      await this.options.onSessionExpired?.();
      return false;
    }
  }
}
