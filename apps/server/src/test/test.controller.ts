import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { TestService } from './test.service';

/**
 * Test-only utilities. These endpoints are guarded against production inside
 * the service, but should never be exposed publicly.
 */
@Controller('test')
export class TestController {
  constructor(private readonly testService: TestService) {}

  @Post('clear-database')
  @HttpCode(HttpStatus.OK)
  clearDatabase() {
    return this.testService.clearDatabase();
  }
}
