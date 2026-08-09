import { Injectable } from '@nestjs/common';
import { GameType, RankingEntry } from '@gaming-platform/core';

import { DbService } from '../db';

const DEFAULT_PAGE_SIZE = 50;

@Injectable()
export class RankingsService {
  constructor(private readonly dbService: DbService) {}

  async getRankings(query: {
    gameType?: GameType;
    limit?: number;
    offset?: number;
  }): Promise<RankingEntry[]> {
    const offset = query.offset ?? 0;
    const rows = await this.dbService.findRankings({
      gameType: query.gameType,
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      offset,
    });
    return rows.map((row, index) => ({ rank: offset + index + 1, ...row }));
  }
}
