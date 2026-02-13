import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.interfaces';
import { ProjectsService } from '../projects/projects.service';
import { AnalysisService } from '../analysis/analysis.service';
import { IssuesService } from './issues.service';
import { TriageAgentService } from './services/triage-agent.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { ReassignIssueDto } from './dto/reassign-issue.dto';

@Controller('projects')
export class IssuesController {
  constructor(
    private issuesService: IssuesService,
    private projectsService: ProjectsService,
    private analysisService: AnalysisService,
    private triageAgentService: TriageAgentService,
  ) {}

  @Post(':id/issues')
  @UseGuards(AuthGuard)
  async createIssue(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateIssueDto,
  ) {
    await this.projectsService.findByIdWithAuth(id, user.id);
    return this.issuesService.createIssue(id, dto);
  }

  @Get(':id/issues')
  @UseGuards(AuthGuard)
  async listIssues(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('area') area?: string,
  ) {
    await this.projectsService.findByIdWithAuth(id, user.id);
    return this.issuesService.findByProjectId(id, { status, priority, area });
  }

  @Get(':id/issues/:issueId')
  @UseGuards(AuthGuard)
  async getIssue(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('issueId') issueId: string,
  ) {
    await this.projectsService.findByIdWithAuth(id, user.id);
    return this.issuesService.findIssueWithDiagnosis(issueId, id);
  }

  @Get(':id/feature-areas')
  @UseGuards(AuthGuard)
  async getFeatureAreas(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    await this.projectsService.findByIdWithAuth(id, user.id);
    const analysis = await this.analysisService.findByProjectId(id);
    return this.triageAgentService.extractFeatureAreas(analysis);
  }

  @Patch(':id/issues/:issueId/reassign')
  @UseGuards(AuthGuard)
  async reassignIssue(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('issueId') issueId: string,
    @Body() dto: ReassignIssueDto,
  ) {
    await this.projectsService.findByIdWithAuth(id, user.id);
    return this.issuesService.reassignIssue(issueId, id, dto.assignedArea);
  }

  @Patch(':id/issues/:issueId/resolve')
  @UseGuards(AuthGuard)
  async resolveIssue(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('issueId') issueId: string,
  ) {
    await this.projectsService.findByIdWithAuth(id, user.id);
    return this.issuesService.resolveIssue(issueId, id);
  }
}
