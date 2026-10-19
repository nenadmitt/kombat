import { Controller, Get, Query } from '@nestjs/common';
import { RecipientLookup } from '@gaming-platform/core';

import { LookupRecipientDto } from './dto/lookup-recipient.dto';
import { UsersService } from './users.service';

// Unauthenticated on purpose: the web stake form checks a beneficiary before the visitor has a session.
@Controller('users')
export class UsersLookupController {
  constructor(private readonly usersService: UsersService) {}

  @Get('lookup')
  lookup(@Query() dto: LookupRecipientDto): Promise<RecipientLookup> {
    return this.usersService.lookupRecipient(dto.query);
  }
}
