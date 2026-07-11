import type {
  ExchangeTokenResponse,
  UserProfile,
} from '../authentication/authentication.types';
import type { GameRoomSummary, GameType } from '../games/game-room.types';
import type {
  MatchHistoryEntry,
  StakeAsset,
  WalletBalances,
} from '../games/stake.types';
import type { BattleshipRoomState } from '../games/battleship/battleship.protocol';
import type {
  CreateWalletResponse,
  WalletNetwork,
  WalletSummary,
} from '../wallets/wallet.types';
import { ErrorCode } from './error-codes';

export type ApiClientOptions = {
  baseUrl: string;
  /** Injected by the consumer — core stays platform-agnostic (no AsyncStorage/Keychain here). */
  getAccessToken?: () => Promise<string | null>;
  /** Request timeout in ms before it's treated as a network failure. Defaults to 10000. */
  timeoutMs?: number;
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

  createWallet(network: WalletNetwork): Promise<CreateWalletResponse> {
    return this.request('POST', '/wallets', { network }, true);
  }

  listWallets(): Promise<WalletSummary[]> {
    return this.request('GET', '/wallets', undefined, true);
  }

  getCurrentUser(): Promise<UserProfile> {
    return this.request('GET', '/users/me', undefined, true);
  }

  updateUsername(username: string): Promise<UserProfile> {
    return this.request('PATCH', '/users/me/username', { username }, true);
  }

  createGameRoom(
    gameType: GameType,
    /** Omit for a free game. Amount is base units (see parseStakeAmount). */
    stake?: { token: StakeAsset; amount: string },
  ): Promise<GameRoomSummary> {
    return this.request(
      'POST',
      '/games/rooms',
      {
        gameType,
        ...(stake ? { stakeToken: stake.token, stakeAmount: stake.amount } : {}),
      },
      true,
    );
  }

  /** Completed matches (result, stake, prize) for the History screen. */
  getMatchHistory(): Promise<MatchHistoryEntry[]> {
    return this.request('GET', '/games/rooms/history', undefined, true);
  }

  /** On-chain balances for the user's wallet. */
  getWalletBalances(): Promise<WalletBalances> {
    return this.request('GET', '/wallets/balances', undefined, true);
  }

  listPendingGameRooms(options?: {
    /** Leave out rooms created by the requesting user. */
    excludeOwn?: boolean;
  }): Promise<GameRoomSummary[]> {
    const query = options?.excludeOwn ? '?excludeOwn=true' : '';
    return this.request('GET', `/games/rooms${query}`, undefined, true);
  }

  closeGameRoom(id: string): Promise<{ success: true }> {
    return this.request('DELETE', `/games/rooms/${id}`, undefined, true);
  }

  /** Forfeit an in-progress match (the opponent wins). */
  forfeitGameRoom(id: string): Promise<{ winnerUserId: string }> {
    return this.request('POST', `/games/rooms/${id}/forfeit`, undefined, true);
  }

  joinGameRoom(id: string): Promise<GameRoomSummary> {
    return this.request('POST', `/games/rooms/${id}/join`, undefined, true);
  }

  /** The current user's own open room, if any — null when they don't have one. */
  getMyActiveGameRoom(): Promise<GameRoomSummary | null> {
    return this.request('GET', '/games/rooms/mine', undefined, true);
  }

  /** The requester's personalized Battleship match state — used to mount/resume. */
  getBattleshipRoomState(roomId: string): Promise<BattleshipRoomState> {
    return this.request('GET', `/games/rooms/${roomId}/state`, undefined, true);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    authenticated = false,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
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
      response = await fetch(`${this.options.baseUrl}${ApiClient.API_PREFIX}${path}`, {
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
}
