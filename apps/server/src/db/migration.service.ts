import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class MigrationService implements OnModuleInit {
  private readonly logger = new Logger(MigrationService.name);

  // Arbitrary, but must never change: it identifies the migration lock across instances and releases.
  private static readonly LOCK_KEY = 4_314_907_001n;

  private static readonly LOCK_TIMEOUT = '5min';

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.runMigrations();
  }

  // Session advisory lock so concurrent boots don't both migrate. Breaks behind a transaction-mode PgBouncer.
  private async runMigrations() {
    if (!this.dataSource.isInitialized) {
      await this.dataSource.initialize();
    }

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    let locked = false;
    try {
      await runner.query(`SET lock_timeout = '${MigrationService.LOCK_TIMEOUT}'`);
      await runner.query('SELECT pg_advisory_lock($1)', [
        MigrationService.LOCK_KEY.toString(),
      ]);
      locked = true;

      // Re-checked under the lock so a queued instance doesn't re-run what was just applied.
      if (!(await this.dataSource.showMigrations())) {
        this.logger.log('No pending migrations.');
        return;
      }

      this.logger.log('Applying pending migrations...');
      const executed = await this.dataSource.runMigrations({
        transaction: 'each',
      });
      executed.forEach((migration) => {
        this.logger.log(`Applied migration: ${migration.name}`);
      });
      this.logger.log(`Applied ${executed.length} migration(s).`);
    } finally {
      if (locked) {
        await runner.query('SELECT pg_advisory_unlock($1)', [
          MigrationService.LOCK_KEY.toString(),
        ]);
      }
      await runner.release();
    }
  }
}
