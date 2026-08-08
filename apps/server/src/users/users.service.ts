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

/** Crypto-backed uniform in [0,1) for referral-code generation. */
const cryptoRand = () => randomInt(0, 281474976710655) / 281474976710655;
/** Codes are 8 chars from a 32-glyph alphabet; collisions are vanishingly
 *  rare, but the unique index is the real guard so we simply re-roll. */
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

    let saved: UserEntity;
    try {
      saved = await this.dbService.saveUser(user);
    } catch (err) {
      // Postgres unique_violation — the app-level check above is just a
      // friendly pre-check; this is the real guard against a race.
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('Username is already taken');
      }
      throw err;
    }

    if (!saved.ensName) {
      // Detached like the signup grant: a Namespace outage must not fail the
      // username, and the next username call retries.
      void this.mintSubname(saved);
    }
    return saved;
  }

  /**
   * A name with no address resolves to nothing, so the mint waits for the
   * wallet. Whichever of the two lands second is what triggers it.
   */
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

    // Ordered most-played first, so the head is the headline and the length
    // is how many different games the player has finished a match in.
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

  /**
   * Resolve a stake beneficiary. Accepts a wallet address, an ENS name (dots)
   * or a bare username. Only platform wallets resolve: an address nobody plays
   * under is "not found", which is what stops the web stake form firing at a
   * pot credit that no player can ever spend.
   */
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
