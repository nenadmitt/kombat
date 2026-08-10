import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  GameRoomStatus,
  GameType,
  SettlementStatus,
  ROOM_EVENTS,
  STAKE_ASSET_DECIMALS,
  STAKE_ASSET_SYMBOLS,
  STAKE_EVENTS,
  STAKE_PRESETS,
  StakeAsset,
  isPresetStakeAmount,
  isStakeableAsset,
} from '@gaming-platform/core';

import { CacheKeys, CacheService } from '../../cache';
import { ConfigurationService } from '../../configuration/configuration.service';
import { DbService } from '../../db';
import { GameRoomEntity } from '../../db/entities/game-room.entity';
import { StakePotChainService, StakePotService } from '../../stake-pot';
import type { StakeSettlementTotals } from '../../stake-pot/stake-pot.service';
import { WebsocketsService } from '../../websockets';
import { isMultiSeatGame } from '../game-type.util';
import { participantsOf } from '../room.util';
import { stakeLegsOf } from './stake-legs.util';

const MATCH_KEY_BY_GAME: Record<GameType, (roomId: string) => string> = {
  [GameType.NavalBattle]: CacheKeys.battleshipMatch,
  [GameType.Ludo]: CacheKeys.ludoMatch,
  [GameType.TripleCut]: CacheKeys.rpsMatch,
  [GameType.ChromaClash]: CacheKeys.chromaMatch,
  [GameType.Salvo]: CacheKeys.salvoMatch,
};

/**
 * Stake lifecycle: validates stakes, holds every player's stake from the pot
 * when a room fills, and settles it when the match ends. Free rooms
 * (stakeToken null) never touch any of this.
 *
 * Every step is a database transaction, so a staked match starts as fast as a
 * free one and costs nothing on-chain. The `match_settlements` row is still written
 * because `assertRoomPlayable`, the match history and the net-stake reporting
 * all read it.
 */
@Injectable()
export class StakesService {
  private readonly logger = new Logger(StakesService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly cacheService: CacheService,
    private readonly configurationService: ConfigurationService,
    private readonly websocketsService: WebsocketsService,
    private readonly stakePotService: StakePotService,
    private readonly stakePotChainService: StakePotChainService,
  ) {}

  // ---- validation ----------------------------------------------------------

  get enabled(): boolean {
    return this.stakePotChainService.enabled;
  }

  /** Stakes are stablecoins/KOMBAT only, at fixed preset sizes. */
  validateStake(asset: StakeAsset, amount: string): void {
    if (!this.enabled) {
      throw new BadRequestException('Staked games are not available right now.');
    }
    const symbol = STAKE_ASSET_SYMBOLS[asset];
    if (!isStakeableAsset(asset)) {
      throw new BadRequestException(`${symbol} cannot be staked.`);
    }
    if (!isPresetStakeAmount(asset, amount)) {
      throw new BadRequestException(
        `Stake must be one of ${STAKE_PRESETS.join(', ')} ${symbol}.`,
      );
    }
    const max =
      BigInt(this.configurationService.STAKE_MAX) *
      10n ** BigInt(STAKE_ASSET_DECIMALS[asset]);
    if (BigInt(amount) > max) {
      throw new BadRequestException(
        `Stake exceeds the ${this.configurationService.STAKE_MAX} ${symbol} maximum.`,
      );
    }
  }

  /**
   * Reject a player who can't cover the stake before they take a seat. Only an
   * early courtesy: the hold in `beginFunding` is the authoritative check, so
   * there is no gap for the balance to move through.
   */
  async assertSufficientBalance(
    userId: string,
    asset: StakeAsset,
    amount: string,
  ): Promise<void> {
    const available = await this.stakePotService.availableBalance(userId, asset);
    if (available < BigInt(amount)) {
      throw new ConflictException(
        `Not enough ${STAKE_ASSET_SYMBOLS[asset]} in your stake pot. Top it up to play this match.`,
      );
    }
  }

  /** Match-start gate: a staked room is playable only once its stakes are held. */
  async assertRoomPlayable(room: GameRoomEntity): Promise<void> {
    if (room.stakeToken === null) {
      return;
    }
    const settlement = await this.dbService.findMatchSettlementByRoomId(room.id);
    if (!settlement || settlement.status === SettlementStatus.Funding) {
      throw new ConflictException('Stakes are still being secured.');
    }
    if (
      settlement.status === SettlementStatus.Failed ||
      settlement.status === SettlementStatus.VoidPending ||
      settlement.status === SettlementStatus.Voided
    ) {
      throw new ConflictException('Stake funding failed - the match was voided.');
    }
  }

  // ---- funding -------------------------------------------------------------

  /**
   * The room just filled: hold every player's stake.
   *
   * Resolves before the caller's HTTP response is sent, so `stake:funded` also
   * fires before a joiner could subscribe to it. Callers must treat a normal
   * return as "stakes are held" and a throw as "the match is off" rather than
   * waiting on the event.
   */
  async beginFunding(room: GameRoomEntity): Promise<void> {
    await this.dbService.createMatchSettlement({
      roomId: room.id,
      status: SettlementStatus.Funding,
    });
    this.notifyPlayers(room, STAKE_EVENTS.funding, { roomId: room.id });

    if (!(await this.holdFromPot(room))) {
      throw new ConflictException(
        'Stakes could not be secured - the match was cancelled and nothing was charged.',
      );
    }
  }

  /**
   * Recovery for a room orphaned in Funding by a crash between the settlement
   * row and the hold. Idempotent per (room, player), so re-running only fills in
   * what is missing.
   */
  async recoverFunding(roomId: string): Promise<void> {
    const settlement = await this.dbService.findMatchSettlementByRoomId(roomId);
    if (!settlement || settlement.status !== SettlementStatus.Funding) {
      return;
    }
    const room = await this.dbService.findGameRoomByIdFresh(roomId);
    if (!room || room.stakeToken === null || participantsOf(room).length < 2) {
      return;
    }
    this.logger.warn(`Recovering orphaned stake funding for room ${roomId}`);
    await this.holdFromPot(room);
  }

  /**
   * A Funded settlement whose match never materialized: the first deadline is
   * only armed on `enter`, so a room nobody entered has nothing else to end it.
   * With no match in the cache, void and refund. A Completed room with a Funded
   * settlement is the sibling crash window (died between the room write and the
   * settlement claim) - finish it with the recorded result.
   */
  async recoverStrandedFunded(roomId: string): Promise<void> {
    const room = await this.dbService.findGameRoomByIdFresh(roomId);
    if (!room) {
      return;
    }
    if (room.status === GameRoomStatus.Completed) {
      await this.completeMatch(
        roomId,
        room.winnerUserId ?? null,
        room.endReason ?? 'recovered',
      );
      return;
    }
    const matchKey = MATCH_KEY_BY_GAME[room.gameType];
    if (await this.cacheService.get(matchKey(roomId))) {
      return; // Someone entered - the turn clock owns it.
    }
    this.logger.warn(`Voiding never-entered staked room ${roomId}`);
    await this.completeMatch(roomId, null, 'never-started');
  }

  /** Moves every participant's stake available -> locked, all of it or none. */
  private async holdFromPot(room: GameRoomEntity): Promise<boolean> {
    try {
      await this.stakePotService.holdForMatch(room.id, stakeLegsOf(room));
    } catch (error) {
      await this.dbService.updateMatchSettlement(room.id, {
        status: SettlementStatus.Voided,
        attempts: 1,
        error: error instanceof Error ? error.message : String(error),
      });
      await this.dbService.completeGameRoom(room.id, {
        winnerUserId: null,
        endReason: 'stake-failed',
      });
      this.notifyPlayers(room, STAKE_EVENTS.failed, {
        roomId: room.id,
        reason:
          'A player no longer had enough in their stake pot - the match was cancelled and nothing was charged.',
      });
      return false;
    }

    await this.dbService.updateMatchSettlement(room.id, {
      status: SettlementStatus.Funded,
      error: null,
    });
    this.emitFundedAndStart(room);
    return true;
  }

  /**
   * Emits `stake:funded` and then the one lifecycle event that moves waiting
   * apps into the match - the creator's opponent-joined for 2-player rooms, the
   * started broadcast for multi-seat (Ludo/Chroma) rooms.
   *
   * Exactly one such event per transition, never two in a tick: the client has
   * to serialize its modal dismissal against the navigation push.
   */
  private emitFundedAndStart(room: GameRoomEntity): void {
    const roomId = room.id;
    this.notifyPlayers(room, STAKE_EVENTS.funded, { roomId });
    if (isMultiSeatGame(room.gameType)) {
      for (const participant of participantsOf(room)) {
        this.websocketsService.sendToUser(participant, ROOM_EVENTS.started, {
          roomId,
        });
      }
    } else {
      this.websocketsService.sendToUser(
        room.userId,
        ROOM_EVENTS.opponentJoined,
        { roomId },
      );
    }
  }

  // ---- settlement ----------------------------------------------------------

  /**
   * A match reached its end state: persist the result and move the money. The
   * single funnel for every way a match can end.
   */
  async completeMatch(
    roomId: string,
    winnerUserId: string | null,
    endReason: string,
  ): Promise<void> {
    await this.dbService.completeGameRoom(roomId, { winnerUserId, endReason });

    const settlement = await this.dbService.findMatchSettlementByRoomId(roomId);
    if (!settlement) {
      return; // Free game.
    }
    if (
      settlement.status !== SettlementStatus.Funding &&
      settlement.status !== SettlementStatus.Funded
    ) {
      return; // Already terminal.
    }

    // Read-through cache is fine: the roster and stake of a room that has just
    // ended cannot change any more.
    const room = await this.dbService.findGameRoomById(roomId);
    if (!room || room.stakeToken === null) {
      return;
    }

    // Claim BEFORE touching the ledger. This runs outside any room
    // lock and can be reached concurrently (a forfeit racing its own retry, a
    // timeout enforcer racing a forfeit), and the status check above is a plain
    // read - so the conditional UPDATE is what actually decides who settles.
    // Without it two callers both credit the winner a full pot.
    const claimed = await this.dbService.claimMatchSettlement(
      roomId,
      winnerUserId ? SettlementStatus.SettlePending : SettlementStatus.VoidPending,
    );
    if (!claimed) {
      return; // Another completion owns this room.
    }

    await this.applySettlement(room, winnerUserId, settlement.status);
  }

  /**
   * Move the money for a claimed settlement and carry it to its terminal status.
   *
   * The caller must already hold the claim. On failure the claim is handed back
   * so a retry can finish the job - a stake left locked under a *Pending status
   * is money stranded with no owner.
   */
  private async applySettlement(
    room: GameRoomEntity,
    winnerUserId: string | null,
    previousStatus: SettlementStatus,
  ): Promise<void> {
    try {
      if (!winnerUserId) {
        await this.stakePotService.releaseMatch(room.id);
        await this.dbService.updateMatchSettlement(room.id, {
          status: SettlementStatus.Voided,
          error: null,
        });
        return;
      }

      const settlement = await this.stakePotService.settleMatch(
        room.id,
        winnerUserId,
        stakeLegsOf(room),
      );
      await this.dbService.updateMatchSettlement(room.id, {
        status: SettlementStatus.Settled,
        // Null when the room was already settled (a replayed completion); leave
        // the recorded figures alone in that case.
        ...(settlement ? settledFigures(settlement) : {}),
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.dbService.releaseMatchSettlementClaim(
        room.id,
        previousStatus,
        message,
      );
      throw error;
    }
  }

  /**
   * Finish a settlement whose owner died mid-flight, leaving the settlement claimed
   * but not settled. Rare (the claim and the ledger write are milliseconds
   * apart) and harmless to run against a healthy job: the ledger's per-room
   * uniqueness means the loser of any race rolls back instead of double-paying.
   */
  async recoverSettlement(roomId: string): Promise<void> {
    const settlement = await this.dbService.findMatchSettlementByRoomId(roomId);
    if (
      !settlement ||
      (settlement.status !== SettlementStatus.SettlePending &&
        settlement.status !== SettlementStatus.VoidPending)
    ) {
      return;
    }
    const room = await this.dbService.findGameRoomByIdFresh(roomId);
    if (!room || room.stakeToken === null) {
      return;
    }
    this.logger.warn(`Recovering stalled settlement for room ${roomId}`);
    // VoidPending was claimed by a no-winner completion; for SettlePending the
    // winner is whatever the room recorded when it was completed.
    await this.applySettlement(
      room,
      settlement.status === SettlementStatus.VoidPending ? null : room.winnerUserId,
      settlement.status,
    );
  }

  private notifyPlayers(
    room: GameRoomEntity,
    event: string,
    payload: unknown,
  ): void {
    // User rooms, not the game channel - players haven't necessarily entered
    // the match screen (and its channel) yet.
    for (const participant of participantsOf(room)) {
      this.websocketsService.sendToUser(participant, event, payload);
    }
  }
}

/**
 * A single-asset match records the scalar columns every existing reader
 * understands; a genuinely mixed one records the per-asset maps, since no
 * scalar can carry two sets of decimals. Exactly one representation is ever
 * present - readers disagree about which to prefer, so both must never be.
 */
function settledFigures(settlement: StakeSettlementTotals): {
  payout: string | null;
  fee: string | null;
  payoutByAsset: Record<string, string> | null;
  feeByAsset: Record<string, string> | null;
} {
  const assets = Object.keys(settlement.payoutByAsset);
  if (assets.length === 1) {
    const asset = assets[0]!;
    return {
      payout: settlement.payoutByAsset[asset]!,
      fee: settlement.feeByAsset[asset] ?? '0',
      payoutByAsset: null,
      feeByAsset: null,
    };
  }
  return {
    payout: null,
    fee: null,
    payoutByAsset: settlement.payoutByAsset,
    feeByAsset: settlement.feeByAsset,
  };
}
