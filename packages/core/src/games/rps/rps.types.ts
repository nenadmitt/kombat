/** A Triple Cut move. */
export type RpsMove = 'rock' | 'paper' | 'scissors';

/** A round's result from one player's perspective. */
export type RpsRoundResult = 'win' | 'loss' | 'tie';

/** Why a match ended (relative to the winner). */
export type RpsEndReason = 'complete' | 'forfeit' | 'timeout';
