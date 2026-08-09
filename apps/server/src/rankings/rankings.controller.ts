import { Controller, Get, Query } from '@nestjs/common';
import { RankingEntry } from '@gaming-platform/core';

import { GetRankingsDto } from './dto/get-rankings.dto';
import { RankingsService } from './rankings.service';

/** Deliberately unauthenticated: the leaderboard shows only public data. */
@Controller('rankings')
export class RankingsController {
  constructor(private readonly rankingsService: RankingsService) {}

  @Get()
  list(@Query() dto: GetRankingsDto): Promise<RankingEntry[]> {
    return this.rankingsService.getRankings(dto);
  }
}
