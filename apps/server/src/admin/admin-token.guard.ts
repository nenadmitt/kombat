import { timingSafeEqual } from 'crypto';

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

import { ConfigurationService } from '../configuration/configuration.service';

/**
 * Operator-only endpoints: the request must carry the ADMIN_TOKEN env value
 * in the `x-admin-token` header. With no ADMIN_TOKEN configured the admin
 * surface is disabled entirely (every request rejected).
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly configurationService: ConfigurationService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configurationService.ADMIN_TOKEN;
    if (!expected) {
      throw new UnauthorizedException('Admin access is not configured');
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
