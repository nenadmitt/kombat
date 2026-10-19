import { PrimaryColumn } from 'typeorm';

export abstract class BaseEntity {
  @PrimaryColumn('uuid', { name: 'id', default: () => 'uuidv7()' })
  id: string;
}
