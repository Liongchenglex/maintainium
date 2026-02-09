import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.interfaces';
import { GitHubOAuthService } from './github-oauth.service';
import { GitHubService } from './github.service';
import { UsersService } from '../users/users.service';

@Controller('github')
export class GitHubController {
  private readonly logger = new Logger(GitHubController.name);
  private readonly frontendUrl: string;

  constructor(
    private oauthService: GitHubOAuthService,
    private githubService: GitHubService,
    private usersService: UsersService,
    private configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.get<string>(
      'CORS_ORIGIN',
      'http://localhost:3000',
    );
  }

  @Get('oauth/initiate')
  @UseGuards(AuthGuard)
  initiateOAuth(@CurrentUser() user: RequestUser) {
    const url = this.oauthService.generateAuthUrl(user.id);
    return { url };
  }

  @Get('oauth/callback')
  async oauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      throw new UnauthorizedException('Missing OAuth parameters');
    }

    try {
      const { userId } = this.oauthService.decodeState(state);
      const accessToken = await this.oauthService.exchangeCodeForToken(code);
      await this.usersService.storeGithubToken(userId, accessToken);

      // Fetch and store GitHub username
      try {
        const ghUser = await this.githubService.getAuthenticatedUser(accessToken);
        await this.usersService.updateGithubUsername(userId, ghUser.login);
      } catch {
        this.logger.warn(`Failed to fetch GitHub username for user ${userId}`);
      }

      res.redirect(`${this.frontendUrl}/dashboard/connect?github=connected`);
    } catch (error) {
      this.logger.error('OAuth callback failed', error);
      res.redirect(`${this.frontendUrl}/dashboard/connect?github=error`);
    }
  }
}
