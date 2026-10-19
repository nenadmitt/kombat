import { randomInt } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GameType,
  PlayerStats,
  PublicUserProfile,
  RecipientLookup,
  StakeAsset,
  WalletNetwork,
  emptyPlayerStats,
  generateReferralCode,
  isValidReferralCode,
  normalizeReferralCode,
} from '@gaming-platform/core';

import { DbService } from '../db';
import { UserEntity } from '../db/entities/user.entity';
import { EnsSubnameService } from '../ens';

const cryptoRand = () => randomInt(0, 281474976710655) / 281474976710655;
const CODE_ATTEMPTS = 5;

@Injectable()
export class UsersService {
  constructor(
    private readonly dbService: DbService,
    private readonly ensSubnameService: EnsSubnameService,
  ) {}

  async getMe(userId: string): Promise<UserEntity> {
    const user = await this.dbService.findUserById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async getPublicProfiles(ids: string[]): Promise<PublicUserProfile[]> {
    const users = await this.dbService.findUsersByIds([...new Set(ids)]);
    return users.map(user => ({
      id: user.id,
      username: user.username,
      // Reserved in the API shape; there is no avatar storage.
      avatarUrl: null,
    }));
  }

  // Attribution is write-once: referredBy is only accepted while it is still empty.
  async updateUsername(
    userId: string,
    username: string,
    referredByCode?: string,
  ): Promise<UserEntity> {
    const existing = await this.dbService.findUserByUsername(username);
    if (existing && existing.id !== userId) {
      throw new ConflictException('Username is already taken');
    }

    const user = await this.getMe(userId);
    user.username = username;

    if (!user.referralCode) {
      user.referralCode = await this.mintReferralCode();
    }

    if (referredByCode && !user.referredByUserId) {
      const code = normalizeReferralCode(referredByCode);
      if (!isValidReferralCode(code)) {
        throw new BadRequestException('That referral code is not valid.');
      }
      const referrer = await this.dbService.findUserByReferralCode(code);
      if (!referrer) {
        throw new BadRequestException('No one owns that referral code.');
      }
      if (referrer.id === userId) {
        throw new BadRequestException('You cannot refer yourself.');
      }
      user.referredByUserId = referrer.id;
    }

    let saved: UserEntity;
    try {
      saved = await this.dbService.saveUser(user);
    } catch (err) {
      // unique_violation: the real guard against a race; the check above is only a pre-check.
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('Username is already taken');
      }
      throw err;
    }

    if (!saved.ensName) {
      // Detached: a Namespace outage must not fail the username, and the next username call retries.
      void this.mintSubname(saved);
    }
    return saved;
  }

  // A name with no address resolves to nothing, so whichever of username and wallet lands second mints.
  private async mintSubname(user: UserEntity): Promise<void> {
    const wallets = await this.dbService.findWalletsForUser(user.id);
    const address = wallets[0]?.address;
    if (!address) {
      return;
    }
    await this.ensSubnameService.mintForUsername(
      user.id,
      user.username!,
      address,
    );
  }

  async getProfile(userId: string): Promise<{
    user: UserEntity;
    referredByUsername: string | null;
  }> {
    const user = await this.getMe(userId);
    const referrer = user.referredByUserId
      ? await this.dbService.findUserById(user.referredByUserId)
      : null;
    return { user, referredByUsername: referrer?.username ?? null };
  }

  async getStats(userId: string): Promise<PlayerStats> {
    const [totals, netRows, referrals, byGameType, bestStreak, user] =
      await Promise.all([
        this.dbService.findMatchTotalsForUser(userId),
        this.dbService.findStakeNetByTokenForUser(userId),
        this.dbService.countReferralsFor(userId),
        this.dbService.findGameTypeCountsForUser(userId),
        this.dbService.findBestWinStreakForUser(userId),
        this.dbService.findUserById(userId),
      ]);

    const netByToken: PlayerStats['netByToken'] = {};
    for (const row of netRows) {
      netByToken[row.stakeToken as StakeAsset] = row.net;
    }

    const [top] = byGameType;

    return {
      ...emptyPlayerStats(),
      games: totals.games,
      wins: totals.wins,
      voids: totals.voids,
      losses: Math.max(0, totals.games - totals.wins - totals.voids),
      netByToken,
      referrals,
      bestStreak,
      distinctGames: byGameType.length,
      joinedAt: user?.createdAt.toISOString() ?? null,
      mostPlayed: top
        ? { gameType: top.gameType as GameType, matches: top.matches }
        : null,
    };
  }

  // Only platform wallets resolve, so the stake form can't credit a pot no player can spend.
  async lookupRecipient(query: string): Promise<RecipientLookup> {
    const q = query.trim();
    let user: UserEntity | null = null;
    let address: string | undefined;

    if (/^0x[0-9a-fA-F]{40}$/.test(q)) {
      const wallet = await this.dbService.findWalletByAddress(q);
      if (!wallet) {
        return { found: false };
      }
      user = await this.dbService.findUserById(wallet.userId);
      address = wallet.address;
    } else if (q.includes('.')) {
      user = await this.dbService.findUserByEnsName(q);
    } else {
      user = await this.dbService.findUserByUsername(q);
    }
    if (!user) {
      return { found: false };
    }

    if (!address) {
      const wallets = await this.dbService.findWalletsForUser(user.id);
      const ethWallet = wallets.find(w => w.network === WalletNetwork.Ethereum);
      if (!ethWallet) {
        return { found: false };
      }
      address = ethWallet.address;
    }

    return {
      found: true,
      username: user.username,
      ensName: user.ensName,
      address,
    };
  }

  private async mintReferralCode(): Promise<string> {
    for (let i = 0; i < CODE_ATTEMPTS; i++) {
      const code = generateReferralCode(cryptoRand);
      if (!(await this.dbService.findUserByReferralCode(code))) {
        return code;
      }
    }
    throw new ConflictException('Could not allocate a referral code, try again.');
  }
}
