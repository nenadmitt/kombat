import { PrimaryColumn } from 'typeorm';

/**
 * Base entity with a UUIDv7 primary key, generated natively by Postgres
 * 18+'s built-in `uuidv7()` function (no app-side generation, no extension
 * needed — unlike v4's `uuid_generate_v4()`). IDs stay time-sortable.
 */
export abstract class UuidV7Entity {
  @PrimaryColumn('uuid', { default: () => 'uuidv7()' })
  id: string;
}
