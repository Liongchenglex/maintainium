import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.interfaces';

@Controller('users')
export class UsersController {
  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@CurrentUser() user: RequestUser) {
    return user;
  }
}
