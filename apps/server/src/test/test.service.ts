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

  /**
   * Truncates every entity-backed table (users, wallets, email_login_tokens,
   * game_rooms), resetting the database to an empty state. The TypeORM
   * migrations table is intentionally left untouched so the schema stays
   * intact — only data is wiped. Disabled in production to avoid
   * catastrophic data loss.
   */
  async clearDatabase(): Promise<{ cleared: string[] }> {
    if (this.configService.IS_PRODUCTION) {
      throw new ForbiddenException('Database reset is disabled in production.');
    }

    const tableNames = await this.dbService.truncateAllTables();
    this.logger.warn(`Cleared database tables: ${tableNames.join(', ')}`);
    return { cleared: tableNames };
  }
}
