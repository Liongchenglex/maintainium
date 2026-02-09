import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import {
  GitHubTokenExpiredError,
  GitHubRateLimitError,
  GitHubSsoRequiredError,
} from './github.errors';

@Catch(GitHubTokenExpiredError, GitHubRateLimitError, GitHubSsoRequiredError)
export class GitHubExceptionFilter implements ExceptionFilter {
  catch(
    exception: GitHubTokenExpiredError | GitHubRateLimitError | GitHubSsoRequiredError,
    host: ArgumentsHost,
  ) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof GitHubTokenExpiredError) {
      response.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'GitHub token expired or revoked. Please reconnect your GitHub account.',
        code: 'GITHUB_TOKEN_EXPIRED',
      });
      return;
    }

    if (exception instanceof GitHubRateLimitError) {
      response.status(HttpStatus.TOO_MANY_REQUESTS).json({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: exception.message,
        code: 'GITHUB_RATE_LIMIT',
        resetAt: exception.resetAt.toISOString(),
      });
      return;
    }

    if (exception instanceof GitHubSsoRequiredError) {
      response.status(HttpStatus.FORBIDDEN).json({
        statusCode: HttpStatus.FORBIDDEN,
        message: exception.message,
        code: 'GITHUB_SSO_REQUIRED',
      });
      return;
    }
  }
}
