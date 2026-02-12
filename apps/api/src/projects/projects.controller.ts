import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseFilters,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.interfaces';
import { GitHubExceptionFilter } from '../github/github.exception-filter';
import { ProjectsService } from './projects.service';
import { UsersService } from '../users/users.service';
import { GitHubService } from '../github/github.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProductionUrlDto } from '../monitor/dto/update-production-url.dto';

@Controller('projects')
@UseFilters(GitHubExceptionFilter)
export class ProjectsController {
  constructor(
    private projectsService: ProjectsService,
    private usersService: UsersService,
    private githubService: GitHubService,
  ) {}

  @Get('repos')
  @UseGuards(AuthGuard)
  async listRepos(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
    @Query('search') search?: string,
  ) {
    const token = await this.usersService.getGithubToken(user.id);
    if (!token) {
      throw new ForbiddenException('GitHub account not connected');
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const perPageNum = Math.min(100, Math.max(1, Number(perPage) || 30));

    const allRepos = await this.githubService.listRepositories(
      token,
      pageNum,
      perPageNum,
    );

    const repos = search
      ? allRepos.filter((repo) =>
          repo.full_name.toLowerCase().includes(search.toLowerCase()),
        )
      : allRepos;

    const connectedIds = await this.projectsService.getConnectedRepoIds(
      user.id,
    );

    return repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      ownerAvatarUrl: repo.owner.avatar_url,
      private: repo.private,
      description: repo.description,
      language: repo.language,
      defaultBranch: repo.default_branch,
      visibility: repo.visibility,
      pushedAt: repo.pushed_at,
      connected: connectedIds.includes(repo.id),
    }));
  }

  @Post()
  @UseGuards(AuthGuard)
  async createProject(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectsService.createFromGitHub(user, dto);
  }

  @Get()
  @UseGuards(AuthGuard)
  async listProjects(@CurrentUser() user: RequestUser) {
    const items = await this.projectsService.listByUser(user.id);
    return items.map(
      ({ webhookSecret, webhookSecretIv, webhookSecretTag, ...rest }) => rest,
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  async getProject(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.projectsService.findByIdWithAuth(id, user.id);
  }

  @Get(':id/tree')
  @UseGuards(AuthGuard)
  async getTree(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query('path') path?: string,
  ) {
    const project = await this.projectsService.findByIdWithAuth(id, user.id);
    const token = await this.usersService.getGithubToken(user.id);
    if (!token) {
      throw new ForbiddenException('GitHub account not connected');
    }

    const sha = path
      ? `${project.githubDefaultBranch}:${path}`
      : project.githubDefaultBranch!;

    const entries = await this.githubService.getTree(
      token,
      project.githubOwner!,
      project.githubRepoName!,
      sha,
    );

    // Sort: directories first, then alphabetical
    return entries
      .map((entry) => ({
        name: entry.path,
        type: entry.type === 'tree' ? 'directory' : 'file',
        sha: entry.sha,
        size: entry.size ?? null,
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  @Get(':id/file')
  @UseGuards(AuthGuard)
  async getFile(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query('path') path: string,
  ) {
    const project = await this.projectsService.findByIdWithAuth(id, user.id);
    const token = await this.usersService.getGithubToken(user.id);
    if (!token) {
      throw new ForbiddenException('GitHub account not connected');
    }

    const file = await this.githubService.getFileContent(
      token,
      project.githubOwner!,
      project.githubRepoName!,
      path,
      project.githubDefaultBranch!,
    );

    const maxSize = 1024 * 1024; // 1MB
    const isBinary = file.encoding !== 'base64' && file.encoding !== 'utf-8';
    const truncated = file.size > maxSize;

    let content = '';
    if (!isBinary && file.content) {
      const decoded = Buffer.from(file.content, 'base64').toString('utf8');
      content = truncated ? decoded.slice(0, maxSize) : decoded;
    }

    return {
      name: file.name,
      path: file.path,
      size: file.size,
      content,
      truncated,
      binary: isBinary,
    };
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  async updateProject(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductionUrlDto,
  ) {
    const project = await this.projectsService.findByIdWithAuth(id, user.id);
    const updated = await this.projectsService.updateProject(project.id, dto);
    const { webhookSecret, webhookSecretIv, webhookSecretTag, ...rest } =
      updated;
    return rest;
  }
}
