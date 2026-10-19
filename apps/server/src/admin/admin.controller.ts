import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { PlatformStatus } from '@gaming-platform/core';

import { MaintenanceService } from '../maintenance';
import { AdminTokenGuard } from './admin-token.guard';
import {
  AdminService,
  type AdminGameRoomView,
  type AdminStatsOverview,
  type AdminUserStats,
  type AdminUserStatsRow,
  type AdminUserView,
  type DeleteUserResult,
} from './admin.service';
import { SetAppVersionDto } from './dto/set-app-version.dto';
import { SetUserBotDto } from './dto/set-user-bot.dto';
import { SeedBotsDto } from './dto/seed-bots.dto';
import { BotSeedService, type BotSeedResult } from '../bots/bot-seed.service';
import { SetMaintenanceDto } from './dto/set-maintenance.dto';

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly maintenanceService: MaintenanceService,
    private readonly botSeedService: BotSeedService,
  ) {}

  @Get('stats')
  getStats(): Promise<AdminStatsOverview> {
    return this.adminService.getStatsOverview();
  }

  @Get('stats/users')
  listUserStats(): Promise<AdminUserStatsRow[]> {
    return this.adminService.listUserStats();
  }

  @Get('stats/users/:id')
  getUserStats(@Param('id') id: string): Promise<AdminUserStats> {
    return this.adminService.getUserStats(id);
  }

  @Get('users')
  listUsers(): Promise<AdminUserView[]> {
    return this.adminService.listUsers();
  }

  @Get('users/active')
  listActiveUsers(): Promise<AdminUserView[]> {
    return this.adminService.listActiveUsers();
  }

  @Post('bots/seed')
  seedBots(@Body() dto: SeedBotsDto): Promise<BotSeedResult> {
    return this.botSeedService.seed(dto.count);
  }

  @Patch('users/:id/bot')
  setUserBot(
    @Param('id') id: string,
    @Body() dto: SetUserBotDto,
  ): Promise<AdminUserView> {
    return this.adminService.setUserBot(id, dto.isBot);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string): Promise<DeleteUserResult> {
    return this.adminService.deleteUser(id);
  }

  @Get('games/active')
  listActiveGames(): Promise<AdminGameRoomView[]> {
    return this.adminService.listActiveGames();
  }

  @Get('maintenance')
  getMaintenance(): Promise<PlatformStatus> {
    return this.maintenanceService.getStatus();
  }

  @Post('maintenance')
  setMaintenance(@Body() dto: SetMaintenanceDto): Promise<PlatformStatus> {
    return this.maintenanceService.setMaintenance(dto.enabled, dto.message);
  }

  @Post('app-version')
  setAppVersion(@Body() dto: SetAppVersionDto): Promise<PlatformStatus> {
    return this.maintenanceService.setAppVersionPolicy({
      minAppVersion: dto.minAppVersion ?? null,
      latestAppVersion: dto.latestAppVersion ?? null,
      updateMessage: dto.updateMessage ?? null,
      updateNotes: dto.updateNotes ?? [],
      updateSizeLabel: dto.updateSizeLabel ?? null,
      updateUrls: {
        ios: dto.updateUrls?.ios ?? null,
        android: dto.updateUrls?.android ?? null,
      },
    });
  }
}
