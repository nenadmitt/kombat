import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  EscrowStatus,
  ROOM_EVENTS,
  STAKE_ASSET_DECIMALS,
  STAKE_ASSET_MIN,
  STAKE_ASSET_SYMBOLS,
  STAKE_EVENTS,
  StakeAsset,
} from '@gaming-platform/core';
import { keccak256, stringToBytes } from 'viem';

import { ConfigurationService } from '../../configuration/configuration.service';
import { DbService } from '../../db';
import { GameRoomEntity } from '../../db/entities/game-room.entity';
import { StakePotChainService, StakePotService } from '../../stake-pot';
import { WebsocketsService } from '../../websockets';
import { isMultiSeatGame } from '../game-type.util';
import { participantsOf } from '../room.util';

/**
 * Stake lifecycle: validates stakes, holds every player's stake from the pot
 * when a room fills, and settles it when the match ends. Free rooms
 * (stakeToken null) never touch any of this.
 *
 * Every step is a database transaction, so a staked match starts as fast as a
 * free one and costs nothing on-chain. The `stake_escrows` row is still written
 * because `assertRoomPlayable`, the match history and the net-stake reporting
 * all read it.
 */
@Injectable()
export class StakesService {
  private readonly logger = new Logger(StakesService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly configurationService: ConfigurationService,
    private readonly websocketsService: WebsocketsService,
    private readonly stakePotService: StakePotService,
    private readonly stakePotChainService: StakePotChainService,
  ) {}

  // ---- validation ----------------------------------------------------------

  get enabled(): boolean {
    return this.stakePotChainService.enabled;
  }

  /** Bounds-check a stake (min per asset, env-configured max). */
  validateStake(asset: StakeAsset, amount: string): void {
    if (!this.enabled) {
      throw new BadRequestException('Staked games are not available right now.');
    }
    if (!/^\d+$/.test(amount)) {
      throw new BadRequestException('Invalid stake amount.');
    }
    const value = BigInt(amount);
    const min = BigInt(STAKE_ASSET_MIN[asset]);
    const max =
      BigInt(this.configurationService.STAKE_MAX) *
      10n ** BigInt(STAKE_ASSET_DECIMALS[asset]);
    const symbol = STAKE_ASSET_SYMBOLS[asset];
    if (value < min) {
      throw new BadRequestException(`Minimum stake not met for ${symbol}.`);
    }
    if (value > max) {
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
    const escrow = await this.dbService.findStakeEscrowByRoomId(room.id);
    if (!escrow || escrow.status === EscrowStatus.Funding) {
      throw new ConflictException('Stakes are still being secured.');
    }
    if (
      escrow.status === EscrowStatus.Failed ||
      escrow.status === EscrowStatus.VoidPending ||
      escrow.status === EscrowStatus.Voided
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
    await this.dbService.createStakeEscrow({
      roomId: room.id,
      matchId: matchIdFor(room.id),
      status: EscrowStatus.Funding,
    });
    this.notifyPlayers(room, STAKE_EVENTS.funding, { roomId: room.id });

    if (!(await this.holdFromPot(room))) {
      throw new ConflictException(
        'Stakes could not be secured - the match was cancelled and nothing was charged.',
      );
    }
  }

  /**
   * Recovery for a room orphaned in Funding by a crash between the escrow row
   * and the hold. Idempotent per (room, player), so re-running only fills in
   * what is missing.
   */
  async recoverFunding(roomId: string): Promise<void> {
    const escrow = await this.dbService.findStakeEscrowByRoomId(roomId);
    if (!escrow || escrow.status !== EscrowStatus.Funding) {
      return;
    }
    const room = await this.dbService.findGameRoomByIdFresh(roomId);
    if (!room || room.stakeToken === null || participantsOf(room).length < 2) {
      return;
    }
    this.logger.warn(`Recovering orphaned stake funding for room ${roomId}`);
    await this.holdFromPot(room);
  }

  /** Moves every participant's stake available -> locked, all of it or none. */
  private async holdFromPot(room: GameRoomEntity): Promise<boolean> {
    try {
      await this.stakePotService.holdForMatch(
        room.id,
        participantsOf(room),
        room.stakeToken!,
        BigInt(room.stakeAmount!),
      );
    } catch (error) {
      await this.dbService.updateStakeEscrow(room.id, {
        status: EscrowStatus.Voided,
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

    await this.dbService.updateStakeEscrow(room.id, {
      status: EscrowStatus.Funded,
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

    const escrow = await this.dbService.findStakeEscrowByRoomId(roomId);
    if (!escrow) {
      return; // Free game.
    }
    if (
      escrow.status !== EscrowStatus.Funding &&
      escrow.status !== EscrowStatus.Funded
    ) {
      return; // Already terminal.
    }

    // Read-through cache is fine: the roster and stake of a room that has just
    // ended cannot change any more.
    const room = await this.dbService.findGameRoomById(roomId);
    if (!room || room.stakeToken === null) {
      return;
    }

    if (!winnerUserId) {
      await this.stakePotService.releaseMatch(roomId);
      await this.dbService.updateStakeEscrow(roomId, {
        status: EscrowStatus.Voided,
        error: null,
      });
      return;
    }

    const settlement = await this.stakePotService.settleMatch(
      roomId,
      winnerUserId,
      participantsOf(room),
      room.stakeToken,
      BigInt(room.stakeAmount!),
    );
    await this.dbService.updateStakeEscrow(roomId, {
      status: EscrowStatus.Settled,
      // Null when the room was already settled (a replayed completion); leave
      // the recorded figures alone in that case.
      ...(settlement
        ? {
            payout: settlement.payout.toString(),
            fee: settlement.fee.toString(),
          }
        : {}),
      error: null,
    });
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

/** The `stake_escrows.match_id` value for a room. */
function matchIdFor(roomId: string): string {
  return keccak256(stringToBytes(roomId));
}
