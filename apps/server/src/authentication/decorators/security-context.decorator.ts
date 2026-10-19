import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { RequestWithSecurityContext } from '../guards/jwt-token.guard';

export const SecurityContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithSecurityContext>();
    return request.securityContext;
  },
);
