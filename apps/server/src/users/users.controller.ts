import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { PlayerStats, PublicUserProfile } from '@gaming-platform/core';

import { ISecurityContext } from '../authentication/authentication.types';
import { SecurityContext } from '../authentication/decorators/security-context.decorator';
import { JwtTokenGuard } from '../authentication/guards/jwt-token.guard';
import { GetProfilesDto } from './dto/get-profiles.dto';
import { UpdateUsernameDto } from './dto/update-username.dto';
import { UsersService } from './users.service';

type UserProfileResponse = {
  id: string;
  email: string | null;
  username: string | null;
  ensName: string | null;
  referralCode: string | null;
  referredByUsername: string | null;
};

@Controller('users')
@UseGuards(JwtTokenGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<UserProfileResponse> {
    const { user, referredByUsername } = await this.usersService.getProfile(
      securityContext.userId,
    );
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      ensName: user.ensName,
      referralCode: user.referralCode,
      referredByUsername,
    };
  }

  @Get('me/stats')
  async getMyStats(
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<PlayerStats> {
    return this.usersService.getStats(securityContext.userId);
  }

  @Get('profiles')
  async getProfiles(
    @Query() dto: GetProfilesDto,
  ): Promise<PublicUserProfile[]> {
    return this.usersService.getPublicProfiles(dto.ids);
  }

  @Patch('me/username')
  async updateUsername(
    @Body() dto: UpdateUsernameDto,
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<UserProfileResponse> {
    const user = await this.usersService.updateUsername(
      securityContext.userId,
      dto.username,
      dto.referredByCode,
    );
    const { referredByUsername } = await this.usersService.getProfile(
      securityContext.userId,
    );
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      ensName: user.ensName,
      referralCode: user.referralCode,
      referredByUsername,
    };
  }
}
