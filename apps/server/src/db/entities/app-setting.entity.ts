import { Column, Entity } from 'typeorm';

import { BaseEntity } from './base.entity';

@Entity('app_settings')
export class AppSettingEntity extends BaseEntity {
  @Column({ name: 'key', type: 'varchar', unique: true, nullable: false })
  key: string;

  @Column({ name: 'value', type: 'jsonb', nullable: false })
  value: unknown;
}
