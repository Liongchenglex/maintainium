import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.module';
import { projects } from '../database/schema';

@Injectable()
export class PreviewApiKeyGuard implements CanActivate {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const apiKey = authHeader.slice(7);
    const projectId = request.params?.id;
    if (!projectId) {
      throw new UnauthorizedException('Missing project ID');
    }

    const [project] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.previewApiKey, apiKey),
        ),
      );

    if (!project) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.previewProjectId = projectId;
    return true;
  }
}
