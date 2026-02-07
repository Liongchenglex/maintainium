import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from './auth.interfaces';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
