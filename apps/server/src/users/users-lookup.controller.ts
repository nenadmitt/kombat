import { Controller, Get, Query } from '@nestjs/common';
import { RecipientLookup } from '@gaming-platform/core';

import { LookupRecipientDto } from './dto/lookup-recipient.dto';
import { UsersService } from './users.service';

/**
 * Deliberately unauthenticated (unlike UsersController): the web stake form
 * checks a beneficiary before the visitor has any session. Returns only what
 * the sender needs: username/ENS and the wallet the pot credits.
 */
@Controller('users')
export class UsersLookupController {
  constructor(private readonly usersService: UsersService) {}

  @Get('lookup')
  lookup(@Query() dto: LookupRecipientDto): Promise<RecipientLookup> {
    return this.usersService.lookupRecipient(dto.query);
  }
}
