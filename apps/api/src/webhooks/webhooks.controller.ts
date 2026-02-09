import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private webhooksService: WebhooksService) {}

  @Post('github')
  async handleGithubWebhook(
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-event') event: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!signature || !event) {
      throw new UnauthorizedException('Missing webhook headers');
    }

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('Missing raw body for signature verification');
    }

    const payload = req.body as Record<string, unknown>;

    try {
      const success = await this.webhooksService.verifyAndProcess(
        signature,
        event,
        rawBody,
        payload,
      );

      if (!success) {
        throw new UnauthorizedException('Webhook verification failed');
      }

      res.status(200).json({ received: true });
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.error('Webhook processing error', error);
      throw new UnauthorizedException('Webhook processing failed');
    }
  }
}
