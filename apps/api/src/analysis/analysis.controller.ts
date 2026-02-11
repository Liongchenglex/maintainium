import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.interfaces';
import { ProjectsService } from '../projects/projects.service';
import { AnalysisService } from './analysis.service';
import { ANALYSIS_EVENTS } from './analysis.constants';

@Controller('projects')
export class AnalysisController {
  constructor(
    private analysisService: AnalysisService,
    private projectsService: ProjectsService,
    private eventEmitter: EventEmitter2,
  ) {}

  @Post(':id/analyze')
  @UseGuards(AuthGuard)
  async triggerAnalysis(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    const project = await this.projectsService.findByIdWithAuth(id, user.id);

    const existing = await this.analysisService.findByProjectId(project.id);
    if (existing?.status === 'analyzing') {
      throw new ConflictException('Analysis already in progress');
    }

    this.eventEmitter.emit(ANALYSIS_EVENTS.PROJECT_RESCAN, {
      projectId: project.id,
      userId: user.id,
    });

    return { message: 'Analysis started', status: 'pending' };
  }

  @Get(':id/analysis')
  @UseGuards(AuthGuard)
  async getAnalysis(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    const project = await this.projectsService.findByIdWithAuth(id, user.id);
    const analysis = await this.analysisService.findByProjectId(project.id);

    if (!analysis) {
      throw new NotFoundException('No analysis found for this project');
    }

    return analysis;
  }
}
