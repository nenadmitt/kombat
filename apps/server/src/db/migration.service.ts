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

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.runMigrations();
  }

  private async runMigrations() {
    if (!this.dataSource.isInitialized) {
      await this.dataSource.initialize();
    }

    const pending = await this.dataSource.showMigrations();
    if (!pending) {
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
  }
}
