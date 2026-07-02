import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';

import { ISecurityContext } from '../authentication/authentication.types';
import { SecurityContext } from '../authentication/decorators/security-context.decorator';
import { JwtTokenGuard } from '../authentication/guards/jwt-token.guard';
import { UpdateUsernameDto } from './dto/update-username.dto';
import { UsersService } from './users.service';

type UserProfileResponse = {
  id: string;
  email: string;
  username: string | null;
};

@Controller('users')
@UseGuards(JwtTokenGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<UserProfileResponse> {
    const user = await this.usersService.getMe(securityContext.userId);
    return { id: user.id, email: user.email, username: user.username };
  }

  @Patch('me/username')
  async updateUsername(
    @Body() dto: UpdateUsernameDto,
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<UserProfileResponse> {
    const user = await this.usersService.updateUsername(
      securityContext.userId,
      dto.username,
    );
    return { id: user.id, email: user.email, username: user.username };
  }
}
