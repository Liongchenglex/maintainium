import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.interfaces';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { GitHubService } from '../github/github.service';
import { PreviewService } from './preview.service';
import { PreviewAgentService } from './preview-agent.service';
import { PreviewApiKeyGuard } from './preview-api-key.guard';
import { SetupPreviewDto } from './dto/setup-preview.dto';
import { CreatePreviewChangeDto } from './dto/create-preview-change.dto';
import { PREVIEW_EVENTS } from './preview.constants';

@Controller('projects')
export class PreviewController {
  private readonly logger = new Logger(PreviewController.name);

  constructor(
    private previewService: PreviewService,
    private previewAgentService: PreviewAgentService,
    private projectsService: ProjectsService,
    private usersService: UsersService,
    private githubService: GitHubService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ── AuthGuard endpoints (dashboard) ──

  @Patch(':id/preview/setup')
  @UseGuards(AuthGuard)
  async setupPreview(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetupPreviewDto,
  ) {
    await this.projectsService.findByIdWithAuth(id, user.id);
    return this.previewService.setupPreview(id, dto.previewUrl);
  }

  @Post(':id/preview/setup/regenerate-key')
  @UseGuards(AuthGuard)
  async regenerateApiKey(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    await this.projectsService.findByIdWithAuth(id, user.id);
    return this.previewService.regenerateApiKey(id);
  }

  @Get(':id/preview/changes')
  @UseGuards(AuthGuard)
  async listChanges(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    await this.projectsService.findByIdWithAuth(id, user.id);
    return this.previewService.findByProjectId(id);
  }

  @Post(':id/preview/changes/:changeId/apply')
  @UseGuards(AuthGuard)
  async applyChange(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('changeId') changeId: string,
  ) {
    const project = await this.projectsService.findByIdWithAuth(id, user.id);
    const change = await this.previewService.findById(changeId, id);

    if (change.status !== 'ready') {
      throw new BadRequestException('Change must be in ready status to apply');
    }

    if (!change.targetFilePath || !change.modifiedContent) {
      throw new BadRequestException('Change is missing required file data');
    }

    if (!project.githubOwner || !project.githubRepoName) {
      throw new BadRequestException('Project missing GitHub info');
    }

    // Use the authenticated user's GitHub token
    const token = await this.usersService.getGithubToken(user.id);
    if (!token) {
      throw new BadRequestException('GitHub account not connected');
    }

    const defaultBranch = project.githubDefaultBranch ?? 'main';
    const branchName = `maintanium/preview-${changeId.slice(0, 8)}`;

    try {
      // Get default branch SHA
      const ref = await this.githubService.getRef(
        token,
        project.githubOwner,
        project.githubRepoName,
        defaultBranch,
      );

      // Create branch
      await this.githubService.createBranch(
        token,
        project.githubOwner,
        project.githubRepoName,
        branchName,
        ref.object.sha,
      );

      // Get existing file SHA for update
      const existingFile = await this.githubService.getFileContent(
        token,
        project.githubOwner,
        project.githubRepoName,
        change.targetFilePath,
        defaultBranch,
      );

      // Commit modified content
      const commit = await this.githubService.createOrUpdateFile(
        token,
        project.githubOwner,
        project.githubRepoName,
        change.targetFilePath,
        change.modifiedContent,
        `fix: ${change.changeSummary || 'Visual preview change'}`,
        branchName,
        existingFile.sha,
      );

      // Create PR
      const pr = await this.githubService.createPullRequest(
        token,
        project.githubOwner,
        project.githubRepoName,
        `[Maintanium] ${change.changeSummary || 'Visual preview change'}`,
        `## Visual Preview Change\n\n**Page:** ${change.currentUrl}\n**Element:** \`<${change.tagName}>\` "${change.elementText}"\n**Requested change:** ${change.requestedChange}\n\n**File modified:** \`${change.targetFilePath}\`\n\n---\n*Created by Maintanium Visual Preview*`,
        branchName,
        defaultBranch,
      );

      // Update change record
      const updated = await this.previewService.updateChange(changeId, {
        status: 'applied',
        branchName,
        commitSha: commit.commit.sha,
        prUrl: pr.html_url,
        prNumber: pr.number,
      });

      this.logger.log(
        `Preview change ${changeId} applied: PR #${pr.number}`,
      );
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Apply failed for change ${changeId}: ${message}`);

      await this.previewService.updateChange(changeId, {
        status: 'failed',
        errorMessage: `Apply failed: ${message}`,
      });

      throw new BadRequestException(`Failed to apply change: ${message}`);
    }
  }

  @Patch(':id/preview/changes/:changeId/dismiss')
  @UseGuards(AuthGuard)
  async dismissChange(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('changeId') changeId: string,
  ) {
    await this.projectsService.findByIdWithAuth(id, user.id);
    return this.previewService.dismissChange(changeId, id);
  }

  // ── PreviewApiKeyGuard endpoint (overlay script) ──

  @Post(':id/preview/changes')
  @UseGuards(PreviewApiKeyGuard)
  async createChange(
    @Param('id') id: string,
    @Body() dto: CreatePreviewChangeDto,
  ) {
    const change = await this.previewService.createChange(id, dto);

    // Fire-and-forget: trigger AI processing
    this.eventEmitter.emit(PREVIEW_EVENTS.CHANGE_SUBMITTED, {
      changeId: change.id,
      projectId: id,
    });

    return { id: change.id, status: change.status };
  }
}
