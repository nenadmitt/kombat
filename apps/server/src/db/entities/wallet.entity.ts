import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WalletType } from '../types/wallet';

@Entity('users')
export class WalletEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: "varchar", unique: true, nullable: false })
  address: string

  @Column({ type: "varchar", unique: true, nullable: false})
  key: string

  @Column({ type: "integer", nullable: false })
  type: WalletType

  @CreateDateColumn()
  createdAt: Date;
}
