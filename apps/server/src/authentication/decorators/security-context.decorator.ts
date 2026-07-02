import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { RequestWithSecurityContext } from '../guards/jwt-token.guard';

/**
 * Injects the security context attached by JwtTokenGuard.
 * Only valid on routes guarded by `@UseGuards(JwtTokenGuard)`.
 */
export const SecurityContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithSecurityContext>();
    return request.securityContext;
  },
);
