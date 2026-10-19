import { v7 as uuidv7 } from 'uuid';

export class DbUtils {
  // For when the id is needed before save; the column's uuidv7() default only applies when id is unset.
  static newId(): string {
    return uuidv7();
  }
}
