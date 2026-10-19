import { UserPlatform, platformFromHeader } from '@gaming-platform/core';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

// Absent means mobile: shipped mobile builds predate the X-App-Platform header.
export const CallerPlatform = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UserPlatform => {
    const request = context.switchToHttp().getRequest<Request>();
    const raw = request.headers['x-app-platform'];
    return platformFromHeader(Array.isArray(raw) ? raw[0] : raw);
  },
);
