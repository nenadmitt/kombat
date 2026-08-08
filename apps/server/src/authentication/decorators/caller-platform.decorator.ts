import { UserPlatform, platformFromHeader } from '@gaming-platform/core';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Which app the request came from, per X-App-Platform. Absent means mobile:
 * every shipped mobile build predates the header, and they must keep working.
 */
export const CallerPlatform = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UserPlatform => {
    const request = context.switchToHttp().getRequest<Request>();
    const raw = request.headers['x-app-platform'];
    return platformFromHeader(Array.isArray(raw) ? raw[0] : raw);
  },
);
