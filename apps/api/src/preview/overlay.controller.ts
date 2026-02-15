import { Controller, Get, Header } from '@nestjs/common';
import { OVERLAY_SCRIPT_CONTENT } from './overlay-script';

@Controller('preview')
export class OverlayController {
  @Get('overlay.js')
  @Header('Content-Type', 'application/javascript')
  @Header('Cache-Control', 'public, max-age=3600')
  getOverlayScript(): string {
    return OVERLAY_SCRIPT_CONTENT;
  }
}
