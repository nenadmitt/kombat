import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { DbService } from '../db';
import { UserEntity } from '../db/entities/user.entity';

@Injectable()
export class UsersService {
  constructor(private readonly dbService: DbService) {}

  async getMe(userId: string): Promise<UserEntity> {
    const user = await this.dbService.findUserById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateUsername(userId: string, username: string): Promise<UserEntity> {
    const existing = await this.dbService.findUserByUsername(username);
    if (existing && existing.id !== userId) {
      throw new ConflictException('Username is already taken');
    }

    const user = await this.getMe(userId);
    user.username = username;

    try {
      return await this.dbService.saveUser(user);
    } catch (err) {
      // Postgres unique_violation — the app-level check above is just a
      // friendly pre-check; this is the real guard against a race.
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('Username is already taken');
      }
      throw err;
    }
  }
}
