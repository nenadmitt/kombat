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

  get enabled(): boolean {
    return this.stakePotChainService.enabled;
  }

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

  // Early courtesy only: the hold in beginFunding is the authoritative check.
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

  // Resolves before the HTTP response, so stake:funded fires before a joiner can subscribe: trust the return, not the event.
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

  // The first deadline is only armed on enter, so a room nobody entered has nothing else to end it.
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
      return;
    }
    this.logger.warn(`Voiding never-entered staked room ${roomId}`);
    await this.completeMatch(roomId, null, 'never-started');
  }

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

  // Exactly one lifecycle event per transition: the client serializes modal dismissal against the navigation push.
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

  async completeMatch(
    roomId: string,
    winnerUserId: string | null,
    endReason: string,
  ): Promise<void> {
    await this.dbService.completeGameRoom(roomId, { winnerUserId, endReason });

    const settlement = await this.dbService.findMatchSettlementByRoomId(roomId);
    if (!settlement) {
      return;
    }
    if (
      settlement.status !== SettlementStatus.Funding &&
      settlement.status !== SettlementStatus.Funded
    ) {
      return;
    }

    // Cached read is fine: an ended room's roster and stake can no longer change.
    const room = await this.dbService.findGameRoomById(roomId);
    if (!room || room.stakeToken === null) {
      return;
    }

    // Runs outside any room lock, so this conditional UPDATE, not the status read above, decides who settles.
    const claimed = await this.dbService.claimMatchSettlement(
      roomId,
      winnerUserId ? SettlementStatus.SettlePending : SettlementStatus.VoidPending,
    );
    if (!claimed) {
      return;
    }

    await this.applySettlement(room, winnerUserId, settlement.status);
  }

  // On failure the claim is handed back so a retry can finish; a stake locked under *Pending is stranded.
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
    // User rooms, not the game channel: players may not have entered the match screen yet.
    for (const participant of participantsOf(room)) {
      this.websocketsService.sendToUser(participant, event, payload);
    }
  }
}

// Exactly one representation is ever present: readers disagree about which to prefer.
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
