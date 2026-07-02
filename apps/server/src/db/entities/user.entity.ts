import { Column, CreateDateColumn, Entity } from 'typeorm';
import { UuidV7Entity } from './base.entity';

@Entity('users')
export class UserEntity extends UuidV7Entity {
  @Column({ type: 'varchar', unique: true, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', unique: true, nullable: false })
  username: string;

  @CreateDateColumn()
  createdAt: Date;
}
