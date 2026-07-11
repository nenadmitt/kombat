import { Controller, Get } from '@nestjs/common';

import { CacheService } from './cache';

@Controller()
export class AppController {
  constructor(private readonly cacheService: CacheService) {}

  @Get('health')
  health() {
    return { status: 'ok', cache: this.cacheService.driver };
  }
}
