import { Column, CreateDateColumn, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('users')
export class UserEntity extends BaseEntity {
  @Column({ name: 'email', type: 'varchar', unique: true, nullable: false })
  email: string;

  @Column({ name: 'username', type: 'varchar', unique: true, nullable: true })
  username: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
