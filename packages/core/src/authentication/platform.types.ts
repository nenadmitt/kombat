/**
 * Which client an account belongs to. An account is created by one app and
 * signs in only there: the two have different custody models (a mobile wallet
 * lives on the device, a web wallet is held encrypted by the platform), so an
 * account cannot meaningfully move between them.
 *
 * Stored server-side as smallint (0/1), not a Postgres enum.
 */
export enum UserPlatform {
  Mobile = 0,
  Web = 1,
}

/** Sent as X-App-Platform. Absent means mobile: builds predating the header. */
export type AppPlatform = 'web' | 'mobile';

export const platformFromHeader = (value: string | undefined): UserPlatform =>
  value === 'web' ? UserPlatform.Web : UserPlatform.Mobile;
