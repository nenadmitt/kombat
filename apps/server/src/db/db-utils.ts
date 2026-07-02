import { v7 as uuidv7 } from 'uuid';

export class DbUtils {
  /**
   * Generates a UUIDv7 in application code. Use when you need the id before
   * the row is saved (e.g. to reference it in a related record, or return
   * it to a caller before the insert completes). Set it explicitly on the
   * entity — `entity.id = DbUtils.newId()` — before calling `.save()`; the
   * column's `uuidv7()` DB default only applies when `id` is left unset.
   */
  static newId(): string {
    return uuidv7();
  }
}
