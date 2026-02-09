import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.interfaces';
import { UsersService } from './users.service';
import { StoreGithubTokenDto } from './dto/store-github-token.dto';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@CurrentUser() user: RequestUser) {
    return user;
  }

  @Post('me/github-token')
  @UseGuards(AuthGuard)
  async storeGithubToken(
    @CurrentUser() user: RequestUser,
    @Body() dto: StoreGithubTokenDto,
  ) {
    await this.usersService.storeGithubToken(user.id, dto.accessToken);
    return { success: true };
  }

  @Get('me/github-status')
  @UseGuards(AuthGuard)
  async getGithubStatus(@CurrentUser() user: RequestUser) {
    const connected = await this.usersService.hasGithubToken(user.id);
    const githubUsername = connected
      ? await this.usersService.getGithubUsername(user.id)
      : null;
    return { connected, githubUsername };
  }
}
