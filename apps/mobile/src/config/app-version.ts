import { buildNumber, version } from '../../package.json';

/** The JS bundle ships inside the binary that this version stamps (see
 *  scripts/sync-version.mjs), so no native module is needed to read it. */
export const APP_VERSION: string = version;
export const APP_BUILD_NUMBER: number = buildNumber;
