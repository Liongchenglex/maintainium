import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.interfaces';
import { ProjectsService } from '../projects/projects.service';
import { MonitorService } from './monitor.service';

@Controller('projects')
export class MonitorController {
  constructor(
    private monitorService: MonitorService,
    private projectsService: ProjectsService,
  ) {}

  @Post(':id/scan')
  @UseGuards(AuthGuard)
  async triggerScan(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    await this.projectsService.findByIdWithAuth(id, user.id);
    return this.monitorService.requestScan(id);
  }

  @Post(':id/live-check')
  @UseGuards(AuthGuard)
  async liveCheck(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    await this.projectsService.findByIdWithAuth(id, user.id);
    return this.monitorService.runLiveCheck(id);
  }

  @Get(':id/scans')
  @UseGuards(AuthGuard)
  async getScans(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    await this.projectsService.findByIdWithAuth(id, user.id);
    return this.monitorService.findScans(id);
  }

  @Get(':id/findings')
  @UseGuards(AuthGuard)
  async getFindings(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('scanner') scanner?: string,
  ) {
    await this.projectsService.findByIdWithAuth(id, user.id);
    return this.monitorService.findFindings(id, { status, severity, scanner });
  }

  @Post(':id/findings/:findingId/dismiss')
  @UseGuards(AuthGuard)
  async dismissFinding(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('findingId') findingId: string,
  ) {
    await this.projectsService.findByIdWithAuth(id, user.id);
    return this.monitorService.dismissFinding(findingId, id);
  }
}
