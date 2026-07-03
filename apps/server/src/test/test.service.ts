import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ConfigurationService } from '../configuration/configuration.service';

@Injectable()
export class TestService {
  private readonly logger = new Logger(TestService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigurationService,
  ) {}

  /**
   * Truncates every entity-backed table (users, wallets, email_login_tokens),
   * resetting the database to an empty state. The TypeORM migrations table is
   * intentionally left untouched so the schema stays intact — only data is
   * wiped. Disabled in production to avoid catastrophic data loss.
   */
  async clearDatabase(): Promise<{ cleared: string[] }> {
    if (this.configService.IS_PRODUCTION) {
      throw new ForbiddenException('Database reset is disabled in production.');
    }

    const tableNames = this.dataSource.entityMetadatas.map(
      (meta) => meta.tableName,
    );
    const quoted = tableNames.map((name) => `"${name}"`).join(', ');

    this.logger.warn(`Clearing database tables: ${tableNames.join(', ')}`);

    // Single atomic TRUNCATE. RESTART IDENTITY resets sequences; CASCADE
    // covers FK-linked rows (email_login_tokens -> users). The migrations
    // table has no entity, so it is never listed here.
    await this.dataSource.query(
      `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
    );

    return { cleared: tableNames };
  }
}
