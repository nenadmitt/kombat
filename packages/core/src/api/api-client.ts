import type {
  ExchangeTokenResponse,
  UserProfile,
} from '../authentication/authentication.types';
import type {
  CreateWalletResponse,
  WalletNetwork,
  WalletSummary,
} from '../wallets/wallet.types';

export type ApiClientOptions = {
  baseUrl: string;
  /** Injected by the consumer — core stays platform-agnostic (no AsyncStorage/Keychain here). */
  getAccessToken?: () => Promise<string | null>;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Thin fetch wrapper for the gaming-platform server API, shared between mobile and (later) web. */
export class ApiClient {
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
    return this.request('POST', '/api/v1/wallets', { network }, true);
  }

  listWallets(): Promise<WalletSummary[]> {
    return this.request('GET', '/api/v1/wallets', undefined, true);
  }

  getCurrentUser(): Promise<UserProfile> {
    return this.request('GET', '/users/me', undefined, true);
  }

  updateUsername(username: string): Promise<UserProfile> {
    return this.request('PATCH', '/users/me/username', { username }, true);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH',
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

    const response = await fetch(`${this.options.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const isJson = response.headers
      .get('content-type')
      ?.includes('application/json');
    const data: unknown = isJson ? await response.json() : undefined;

    if (!response.ok) {
      const errorBody =
        data && typeof data === 'object'
          ? (data as { message?: unknown; error?: unknown })
          : undefined;
      const message =
        errorBody?.message?.toString() ??
        errorBody?.error?.toString() ??
        response.statusText;
      throw new ApiError(response.status, message);
    }

    return data as T;
  }
}
