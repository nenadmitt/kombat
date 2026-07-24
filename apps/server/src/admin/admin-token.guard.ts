import { timingSafeEqual } from 'crypto';

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

import { ConfigurationService } from '../configuration/configuration.service';

/** An ADMIN_TOKEN shorter than this is refused as unsecured. */
const MIN_ADMIN_TOKEN_LENGTH = 10;

/**
 * Operator-only endpoints: the request must carry the ADMIN_TOKEN env value
 * in the `x-admin-token` header. The admin surface stays locked unless a
 * sufficiently strong token is configured - a blank or too-short ADMIN_TOKEN
 * (under 10 chars) is treated as unsecured and every request is rejected.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly configurationService: ConfigurationService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configurationService.ADMIN_TOKEN;
    if (!expected || expected.length < MIN_ADMIN_TOKEN_LENGTH) {
      throw new UnauthorizedException(
        `Admin access is disabled: ADMIN_TOKEN is unset or unsecured (min ${MIN_ADMIN_TOKEN_LENGTH} characters)`,
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['x-admin-token'];
    const provided = Array.isArray(header) ? header[0] : header;
    if (
      typeof provided !== 'string' ||
      provided.length !== expected.length ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    ) {
      throw new UnauthorizedException('Invalid admin token');
    }
    return true;
  }
}
