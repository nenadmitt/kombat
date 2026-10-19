import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { TestService } from './test.service';

@Controller('test')
export class TestController {
  constructor(private readonly testService: TestService) {}

  @Post('clear-database')
  @HttpCode(HttpStatus.OK)
  clearDatabase() {
    return this.testService.clearDatabase();
  }
}
