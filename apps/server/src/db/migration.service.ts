import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Applies any pending TypeORM migrations on every application start.
 * DbModule sets `migrationsRun: false` on the TypeORM connection itself so
 * this is the single place migrations run — keeps the behavior visible and
 * logged instead of happening silently inside the ORM's bootstrap.
 */
@Injectable()
export class MigrationService implements OnModuleInit {
  private readonly logger = new Logger(MigrationService.name);

  /**
   * Advisory-lock key. Arbitrary, but must never change: it is the identity
   * of "the migration lock" across every instance and release.
   */
  private static readonly LOCK_KEY = 4_314_907_001n;

  /** Long enough for a real migration, short enough to fail a wedged one. */
  private static readonly LOCK_TIMEOUT = '5min';

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.runMigrations();
  }

  /**
   * TypeORM takes no lock of its own, so two instances booting together both
   * see the same pending list and both start applying it - the second then
   * dies on "relation already exists". A session-level advisory lock
   * serialises them: the first migrates, the rest wait and then find nothing
   * to do.
   *
   * Requires a real session, so this breaks under a transaction-pooling
   * connection proxy (PgBouncer in `transaction` mode). Run migrations as a
   * deploy step instead if you ever put one in front of Postgres.
   */
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

      // Re-checked while holding the lock. Checking before would let an
      // instance that queued behind the migrator re-run what it just applied.
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
