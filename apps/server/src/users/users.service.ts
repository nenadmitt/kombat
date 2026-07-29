import { randomInt } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PlayerStats,
  PublicUserProfile,
  StakeAsset,
  emptyPlayerStats,
  generateReferralCode,
  isValidReferralCode,
  normalizeReferralCode,
} from '@gaming-platform/core';

import { DbService } from '../db';
import { UserEntity } from '../db/entities/user.entity';

/** Crypto-backed uniform in [0,1) for referral-code generation. */
const cryptoRand = () => randomInt(0, 281474976710655) / 281474976710655;
/** Codes are 8 chars from a 32-glyph alphabet; collisions are vanishingly
 *  rare, but the unique index is the real guard so we simply re-roll. */
const CODE_ATTEMPTS = 5;

@Injectable()
export class UsersService {
  constructor(private readonly dbService: DbService) {}

  async getMe(userId: string): Promise<UserEntity> {
    const user = await this.dbService.findUserById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /** Public (no-email) profiles for a batch of ids; unknown ids are omitted. */
  async getPublicProfiles(ids: string[]): Promise<PublicUserProfile[]> {
    const users = await this.dbService.findUsersByIds([...new Set(ids)]);
    return users.map(user => ({
      id: user.id,
      username: user.username,
      // No avatar storage yet - the field is reserved in the API shape.
      avatarUrl: null,
    }));
  }

  /**
   * Set the username and, on the way through, mint this user's own referral
   * code and record who referred them.
   *
   * Attribution is write-once: a `referredBy` is only accepted while the
   * field is still empty, so re-running onboarding can never reassign credit.
   */
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

    try {
      return await this.dbService.saveUser(user);
    } catch (err) {
      // Postgres unique_violation — the app-level check above is just a
      // friendly pre-check; this is the real guard against a race.
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('Username is already taken');
      }
      throw err;
    }
  }

  /** The profile payload, with the referrer resolved to a username. */
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

  /** Lifetime record for the Profile screen. */
  async getStats(userId: string): Promise<PlayerStats> {
    const [totals, netRows, referrals] = await Promise.all([
      this.dbService.findMatchTotalsForUser(userId),
      this.dbService.findStakeNetByTokenForUser(userId),
      this.dbService.countReferralsFor(userId),
    ]);

    const netByToken: PlayerStats['netByToken'] = {};
    for (const row of netRows) {
      netByToken[row.stakeToken as StakeAsset] = row.net;
    }

    return {
      ...emptyPlayerStats(),
      games: totals.games,
      wins: totals.wins,
      voids: totals.voids,
      losses: Math.max(0, totals.games - totals.wins - totals.voids),
      netByToken,
      referrals,
    };
  }

  /** Re-roll until the unique index accepts one. */
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
