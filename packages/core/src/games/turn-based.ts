/**
 * Turn-clock rules shared by every turn-based game on the platform
 * (Battleship, Ludo, and whatever comes next). Game-specific protocols
 * re-export these so existing imports keep working.
 */

/** How long a player has to move before the turn times out. */
export const TURN_SECONDS = 30;

/** Total turn timeouts a player may accrue before losing (or, in games with
 *  more than two players, being eliminated). */
export const MAX_TIMEOUTS = 3;
