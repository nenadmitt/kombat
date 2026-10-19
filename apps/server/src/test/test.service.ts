import { ForbiddenException, Injectable, Logger } from '@nestjs/common';

import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db';

@Injectable()
export class TestService {
  private readonly logger = new Logger(TestService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly configService: ConfigurationService,
  ) {}

  async clearDatabase(): Promise<{ cleared: string[] }> {
    if (this.configService.IS_PRODUCTION) {
      throw new ForbiddenException('Database reset is disabled in production.');
    }

    const tableNames = await this.dbService.truncateAllTables();
    this.logger.warn(`Cleared database tables: ${tableNames.join(', ')}`);
    return { cleared: tableNames };
  }
}
