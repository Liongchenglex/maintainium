import {
  Controller,
  Post,
  Req,
  Headers,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { WebhooksService } from './webhooks.service';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private webhooksService: WebhooksService) {}

  @Post('github')
  async handleGithubWebhook(
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-event') event: string,
    @Req() req: RawBodyRequest,
  ) {
    if (!signature || !event) {
      throw new UnauthorizedException('Missing webhook headers');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error('rawBody is not available on request — check rawBody: true in NestFactory.create');
      throw new UnauthorizedException('Missing raw body for signature verification');
    }

    const payload = req.body as Record<string, unknown>;

    const success = await this.webhooksService.verifyAndProcess(
      signature,
      event,
      rawBody,
      payload,
    );

    if (!success) {
      throw new UnauthorizedException('Webhook verification failed');
    }

    return { received: true };
  }
}
