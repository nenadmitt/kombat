/** An account signs in only on the app that created it: the custody models differ. */
export enum UserPlatform {
  Mobile = 0,
  Web = 1,
}

/** Absent means mobile: builds predating the header. */
export type AppPlatform = 'web' | 'mobile';

export const platformFromHeader = (value: string | undefined): UserPlatform =>
  value === 'web' ? UserPlatform.Web : UserPlatform.Mobile;
