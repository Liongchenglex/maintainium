import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/database.module';
import { issueDiagnoses } from '../../database/schema';
import { AnalysisService } from '../../analysis/analysis.service';
import { GitHubService } from '../../github/github.service';
import { UsersService } from '../../users/users.service';
import { ProjectsService } from '../../projects/projects.service';
import { IssuesService } from '../issues.service';
import { EmbeddingService } from './embedding.service';
import {
  IssueTriagedPayload,
  DiagnosisLlmResponse,
} from '../issues.interfaces';

@Injectable()
export class DiagnosisAgentService {
  private readonly logger = new Logger(DiagnosisAgentService.name);
  private client: Anthropic | null = null;
  private readonly model: string;
  private readonly maxRetries = 2;

  constructor(
    private configService: ConfigService,
    @Inject(DRIZZLE) private db: DrizzleDB,
    private analysisService: AnalysisService,
    private issuesService: IssuesService,
    private embeddingService: EmbeddingService,
    private githubService: GitHubService,
    private usersService: UsersService,
    private projectsService: ProjectsService,
  ) {
    const apiKey = this.configService.get<string>('LLM_API_KEY');
    this.model = this.configService.get<string>('LLM_MODEL', 'claude-sonnet-4-5-20250929');

    if (apiKey) {
      this.client = new Anthropic({ apiKey });
      this.logger.log('Diagnosis agent LLM initialized');
    } else {
      this.logger.warn('LLM_API_KEY not set — diagnosis will fail gracefully');
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async handleIssueTriaged(payload: IssueTriagedPayload): Promise<void> {
    this.logger.log(
      `Diagnosing issue ${payload.issueId} (area: ${payload.assignedArea})`,
    );

    try {
      if (!this.isAvailable()) {
        this.logger.warn('LLM not available, marking issue as diagnosis-failed');
        await this.issuesService.updateIssue(payload.issueId, {
          status: 'diagnosis-failed',
        });
        return;
      }

      const issue = await this.issuesService.findById(payload.issueId, payload.projectId);
      const analysis = await this.analysisService.findByProjectId(payload.projectId);

      // Get files relevant to the assigned area from M3
      const areaFiles = this.extractAreaFiles(analysis, payload.assignedArea);
      this.logger.log(`Found ${areaFiles.length} area files for "${payload.assignedArea}"`);

      // Build rich M3 context
      const m3Context = this.buildM3Context(analysis, payload.assignedArea);

      // Fetch actual source code from GitHub for key files
      const fileContents = await this.fetchAreaFileContents(
        payload.userId,
        payload.projectId,
        areaFiles,
        analysis,
      );
      this.logger.log(`Fetched ${fileContents.length} file contents from GitHub`);

      // Query vector memory for similar past issues
      let similarIssues: { content: string; metadata: Record<string, unknown> | null; similarity: number }[] = [];
      if (this.embeddingService.isAvailable()) {
        try {
          const issueText = `${issue.subject}\n${issue.description}`;
          const embedding = await this.embeddingService.embed(issueText);
          similarIssues = await this.embeddingService.findSimilar(
            payload.projectId,
            payload.assignedArea,
            embedding,
            3,
          );
          this.logger.debug(
            `Found ${similarIssues.length} similar past issues (best similarity: ${similarIssues[0]?.similarity?.toFixed(3) ?? 'N/A'})`,
          );
        } catch (error) {
          this.logger.warn(
            `Vector memory query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      const result = await this.diagnoseIssue(
        issue.reporterEmail,
        issue.subject,
        issue.description,
        issue.triageNotes || '',
        payload.assignedArea,
        areaFiles,
        similarIssues,
        m3Context,
        fileContents,
      );

      // Insert diagnosis
      const [diagnosis] = await this.db
        .insert(issueDiagnoses)
        .values({
          issueId: payload.issueId,
          projectId: payload.projectId,
          recommendationType: result.recommendationType,
          summary: result.summary,
          rootCause: result.rootCause,
          complicationScore: Math.max(1, Math.min(10, result.complicationScore)),
          proposedChanges: result.proposedChanges,
          educationContent: result.educationContent,
          clarificationQuestions: result.clarificationQuestions,
        })
        .returning();

      // Update issue status
      await this.issuesService.updateIssue(payload.issueId, {
        status: 'diagnosed',
      });

      this.logger.log(
        `Issue ${payload.issueId} diagnosed: type=${result.recommendationType} score=${result.complicationScore}`,
      );

      // Store in vector memory for future lookups
      if (this.embeddingService.isAvailable()) {
        try {
          const issueText = `${issue.subject}\n${issue.description}`;
          const diagnosisText = `Issue: ${issue.subject}\nRoot Cause: ${result.rootCause}\nSolution: ${result.summary}`;

          const [issueEmbedding, diagnosisEmbedding] = await Promise.all([
            this.embeddingService.embed(issueText),
            this.embeddingService.embed(diagnosisText),
          ]);

          await Promise.all([
            this.embeddingService.storeEmbedding(
              payload.projectId,
              payload.assignedArea,
              'issue',
              issueText,
              issueEmbedding,
              { issueId: payload.issueId },
            ),
            this.embeddingService.storeEmbedding(
              payload.projectId,
              payload.assignedArea,
              'diagnosis',
              diagnosisText,
              diagnosisEmbedding,
              { issueId: payload.issueId, diagnosisId: diagnosis.id },
            ),
          ]);
        } catch (error) {
          this.logger.warn(
            `Failed to store embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Diagnosis failed for issue ${payload.issueId}: ${message}`);

      await this.issuesService.updateIssue(payload.issueId, {
        status: 'diagnosis-failed',
      });
    }
  }

  private extractAreaFiles(
    analysis: Awaited<ReturnType<AnalysisService['findByProjectId']>>,
    assignedArea: string,
  ): string[] {
    if (!analysis?.fileRegistry) return [];

    const files = analysis.fileRegistry as Array<{
      path: string;
      llm?: { feature: string };
    }>;

    return files
      .filter((f) => f.llm?.feature === assignedArea)
      .map((f) => f.path)
      .slice(0, 30);
  }

  private buildM3Context(
    analysis: Awaited<ReturnType<AnalysisService['findByProjectId']>>,
    assignedArea: string,
  ): string {
    if (!analysis) return '';

    const sections: string[] = [];

    // Architecture summary + tech stack from LLM intelligence
    if (analysis.llmIntelligence) {
      const intel = analysis.llmIntelligence as {
        architectureSummary?: string;
        techStackNarrative?: string;
        businessFlows?: Array<{
          name: string;
          description?: string;
          files?: string[];
        }>;
      };

      if (intel.architectureSummary) {
        sections.push(`Architecture Summary:\n${intel.architectureSummary}`);
      }
      if (intel.techStackNarrative) {
        sections.push(`Tech Stack:\n${intel.techStackNarrative}`);
      }

      // Business flow for the assigned area
      const areaFlow = intel.businessFlows?.find((f) => f.name === assignedArea);
      if (areaFlow) {
        let flowText = `Business Flow — "${assignedArea}":\n${areaFlow.description || 'No description'}`;
        if (areaFlow.files?.length) {
          flowText += `\nKey files: ${areaFlow.files.slice(0, 15).join(', ')}`;
        }
        sections.push(flowText);
      }
    }

    // API routes in the area
    if (analysis.apiSurface) {
      const api = analysis.apiSurface as {
        routes?: Array<{
          method: string;
          path: string;
          handlerFile?: string;
          description?: string;
        }>;
        externalCalls?: Array<{
          url?: string;
          method?: string;
          callerFile?: string;
          description?: string;
        }>;
      };

      const areaFileSet = new Set(this.extractAreaFiles(analysis, assignedArea));

      if (api.routes?.length) {
        const areaRoutes = api.routes
          .filter((r) => r.handlerFile && areaFileSet.has(r.handlerFile))
          .slice(0, 15);
        if (areaRoutes.length > 0) {
          sections.push(
            `API Routes in "${assignedArea}":\n` +
            areaRoutes.map((r) => `  ${r.method} ${r.path}${r.description ? ` — ${r.description}` : ''}`).join('\n'),
          );
        }
      }

      if (api.externalCalls?.length) {
        const areaCalls = api.externalCalls
          .filter((c) => c.callerFile && areaFileSet.has(c.callerFile))
          .slice(0, 10);
        if (areaCalls.length > 0) {
          sections.push(
            `External API Calls:\n` +
            areaCalls.map((c) => `  ${c.method || 'GET'} ${c.url || 'unknown'}${c.description ? ` — ${c.description}` : ''}`).join('\n'),
          );
        }
      }
    }

    // Data model schemas
    if (analysis.dataModel) {
      const dm = analysis.dataModel as {
        schemas?: Array<{
          name: string;
          table?: string;
          columns?: Array<{ name: string; type: string; nullable?: boolean }>;
        }>;
      };

      if (dm.schemas?.length) {
        const schemaText = dm.schemas.slice(0, 10).map((s) => {
          const cols = s.columns?.slice(0, 10).map(
            (c) => `    ${c.name}: ${c.type}${c.nullable ? ' (nullable)' : ''}`,
          ).join('\n') || '    (no columns)';
          return `  ${s.name}${s.table ? ` (table: ${s.table})` : ''}:\n${cols}`;
        }).join('\n');
        sections.push(`Data Model:\n${schemaText}`);
      }
    }

    // Codebase patterns
    if (analysis.patterns) {
      const pat = analysis.patterns as {
        authPattern?: string;
        errorHandling?: string;
        namingConvention?: string;
      };
      const patParts: string[] = [];
      if (pat.authPattern) patParts.push(`  Auth: ${pat.authPattern}`);
      if (pat.errorHandling) patParts.push(`  Error handling: ${pat.errorHandling}`);
      if (pat.namingConvention) patParts.push(`  Naming: ${pat.namingConvention}`);
      if (patParts.length > 0) {
        sections.push(`Codebase Patterns:\n${patParts.join('\n')}`);
      }
    }

    // Detailed file analysis for area files
    if (analysis.fileRegistry) {
      const files = analysis.fileRegistry as Array<{
        path: string;
        category?: string;
        language?: string;
        sizeBytes?: number;
        llm?: {
          feature: string;
          purpose?: string;
          businessContext?: string;
          functions?: Array<{ name: string; description?: string }>;
        };
      }>;

      const blastRadius = (analysis.dependencyGraph as {
        blastRadius?: Record<string, number>;
      })?.blastRadius;

      const areaFileDetails = files
        .filter((f) => f.llm?.feature === assignedArea)
        .slice(0, 20);

      if (areaFileDetails.length > 0) {
        const fileLines = areaFileDetails.map((f) => {
          const parts = [`  ${f.path}`];
          if (f.category) parts.push(`    category: ${f.category}`);
          if (f.language) parts.push(`    language: ${f.language}`);
          if (f.llm?.purpose) parts.push(`    purpose: ${f.llm.purpose}`);
          if (f.llm?.businessContext) parts.push(`    business context: ${f.llm.businessContext}`);
          if (blastRadius?.[f.path] !== undefined) {
            parts.push(`    blast radius: ${blastRadius[f.path]}`);
          }
          if (f.llm?.functions?.length) {
            const fns = f.llm.functions.slice(0, 5).map(
              (fn) => `      - ${fn.name}${fn.description ? `: ${fn.description}` : ''}`,
            ).join('\n');
            parts.push(`    functions:\n${fns}`);
          }
          return parts.join('\n');
        }).join('\n\n');
        sections.push(`Detailed File Analysis for "${assignedArea}":\n${fileLines}`);
      }
    }

    return sections.join('\n\n');
  }

  private async fetchAreaFileContents(
    userId: string,
    projectId: string,
    areaFiles: string[],
    analysis: Awaited<ReturnType<AnalysisService['findByProjectId']>>,
  ): Promise<Array<{ path: string; content: string }>> {
    if (areaFiles.length === 0) return [];

    // Get GitHub token
    let token: string | null = null;
    try {
      token = await this.usersService.getGithubToken(userId);
    } catch (error) {
      this.logger.warn(
        `Failed to get GitHub token: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
    if (!token) {
      this.logger.warn('GitHub token unavailable, skipping file content fetch');
      return [];
    }

    // Get project details
    const project = await this.projectsService.findById(projectId);
    if (!project?.githubOwner || !project?.githubRepoName) {
      this.logger.warn('Project missing GitHub info, skipping file content fetch');
      return [];
    }

    // Score and select top 5 files
    const blastRadius = (analysis?.dependencyGraph as {
      blastRadius?: Record<string, number>;
    })?.blastRadius ?? {};

    const fileRegistry = (analysis?.fileRegistry ?? []) as Array<{
      path: string;
      category?: string;
      sizeBytes?: number;
    }>;
    const fileMap = new Map(fileRegistry.map((f) => [f.path, f]));

    const highPriorityCategories = new Set([
      'service', 'api-route', 'middleware', 'schema',
    ]);

    const scored = areaFiles.map((path) => {
      let score = blastRadius[path] ?? 0;
      const meta = fileMap.get(path);
      if (meta?.category && highPriorityCategories.has(meta.category)) {
        score += 10;
      }
      if (meta?.sizeBytes && meta.sizeBytes > 15_000) {
        score -= 5;
      }
      return { path, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const topFiles = scored.slice(0, 5);

    // Fetch files in parallel
    const results = await Promise.allSettled(
      topFiles.map(async ({ path }) => {
        const fileContent = await this.githubService.getFileContent(
          token!,
          project.githubOwner!,
          project.githubRepoName!,
          path,
          project.githubDefaultBranch ?? undefined,
        );

        // base64 decode and truncate to 200 lines
        const decoded = Buffer.from(fileContent.content, 'base64').toString('utf-8');
        const lines = decoded.split('\n');
        const truncated = lines.length > 200
          ? lines.slice(0, 200).join('\n') + `\n... (truncated, ${lines.length - 200} more lines)`
          : decoded;

        return { path, content: truncated };
      }),
    );

    const fetched: Array<{ path: string; content: string }> = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        fetched.push(result.value);
      } else {
        this.logger.warn(
          `Failed to fetch file from GitHub: ${result.reason instanceof Error ? result.reason.message : 'Unknown error'}`,
        );
      }
    }

    return fetched;
  }

  private async diagnoseIssue(
    reporterEmail: string,
    subject: string,
    description: string,
    triageNotes: string,
    assignedArea: string,
    areaFiles: string[],
    similarIssues: { content: string; similarity: number }[],
    m3Context: string,
    fileContents: Array<{ path: string; content: string }>,
  ): Promise<DiagnosisLlmResponse> {
    // Build system prompt sections
    const promptParts: string[] = [
      `You are a diagnosis agent for a software project. Given a customer-reported issue that has been triaged to the "${assignedArea}" feature area, analyze the issue and provide a detailed diagnosis.`,
    ];

    // M3 structured context
    if (m3Context) {
      promptParts.push(`\nCodebase Intelligence (from static analysis):\n${m3Context}`);
    }

    // File paths
    if (areaFiles.length > 0) {
      promptParts.push(
        `\nAll files in the "${assignedArea}" area:\n${areaFiles.map((f) => `- ${f}`).join('\n')}`,
      );
    }

    // Actual source code
    if (fileContents.length > 0) {
      const codeBlocks = fileContents.map(
        (f) => `--- ${f.path} ---\n${f.content}\n--- end ${f.path} ---`,
      ).join('\n\n');
      promptParts.push(`\nSource code for key files:\n${codeBlocks}`);
    }

    // Similar past issues
    if (similarIssues.length > 0) {
      promptParts.push(
        `\nSimilar past issues (from vector memory):\n${similarIssues.map((s, i) => `${i + 1}. (similarity: ${s.similarity.toFixed(3)})\n${s.content}`).join('\n\n')}`,
      );
    }

    // JSON response format
    promptParts.push(`
Respond with ONLY valid JSON (no markdown, no explanation):
{
  "recommendationType": "code-fix|user-education|needs-clarification|escalation",
  "summary": "1-2 sentence summary of the diagnosis",
  "rootCause": "Detailed explanation of the likely root cause",
  "complicationScore": 1 to 10,
  "proposedChanges": null or InvestigationData object (see below),
  "educationContent": null or string (if user-education),
  "clarificationQuestions": null or string[] (if needs-clarification)
}

Rules:
- recommendationType: "code-fix" if a code change can fix it, "user-education" if it's a user misunderstanding, "needs-clarification" if more info is needed, "escalation" if too complex or risky
- complicationScore: 1 = trivial fix, 5 = moderate refactor, 10 = architectural change
- If "code-fix", proposedChanges MUST be an InvestigationData object:
  {
    "diagnosis": { "summary": "...", "rootCause": "...", "impact": "...", "confidence": "high|medium|low" },
    "proposal": { "strategy": "...", "estimatedEffort": "...", "files": [{ "path": "...", "action": "modify|create|delete", "description": "..." }] },
    "changes": [{ "filePath": "...", "language": "...", "hunks": [{ "header": "...", "lines": [{ "type": "context|add|remove", "content": "..." }] }] }],
    "testScope": [{ "category": "...", "items": ["..."] }]
  }
- If NOT "code-fix", proposedChanges MUST be null
- educationContent: only for "user-education" — explain what the user should do differently
- clarificationQuestions: only for "needs-clarification" — list specific questions to ask the reporter
- When proposing code changes, reference actual code from the source files provided above for accurate diffs`);

    const systemPrompt = promptParts.join('\n');

    const userMessage = `Reporter: ${reporterEmail}
Subject: ${subject}

Description:
${description}

Triage Notes:
${triageNotes}`;

    const response = await this.callWithRetry(systemPrompt, userMessage);
    return this.parseDiagnosisResponse(response);
  }

  private async callWithRetry(systemPrompt: string, userMessage: string): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client!.messages.create({
          model: this.model,
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: 'user' as const, content: userMessage }],
        });

        const textBlock = response.content.find((b) => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          throw new Error('No text response from LLM');
        }

        return textBlock.text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (lastError.message.includes('429') || lastError.message.includes('rate')) {
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.warn(`Rate limited, retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error('LLM call failed after retries');
  }

  private parseDiagnosisResponse(response: string): DiagnosisLlmResponse {
    try {
      const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;

      const validTypes = ['code-fix', 'user-education', 'needs-clarification', 'escalation'] as const;
      const recommendationType = validTypes.includes(parsed.recommendationType as typeof validTypes[number])
        ? (parsed.recommendationType as typeof validTypes[number])
        : 'escalation';

      return {
        recommendationType,
        summary: String(parsed.summary || 'Diagnosis could not generate a summary.'),
        rootCause: String(parsed.rootCause || 'Root cause unknown.'),
        complicationScore: Math.max(1, Math.min(10, Number(parsed.complicationScore) || 5)),
        proposedChanges: recommendationType === 'code-fix' && parsed.proposedChanges
          ? (parsed.proposedChanges as DiagnosisLlmResponse['proposedChanges'])
          : null,
        educationContent: recommendationType === 'user-education'
          ? String(parsed.educationContent || '')
          : null,
        clarificationQuestions: recommendationType === 'needs-clarification' && Array.isArray(parsed.clarificationQuestions)
          ? (parsed.clarificationQuestions as string[]).map(String)
          : null,
      };
    } catch {
      this.logger.warn('Failed to parse diagnosis LLM response');
      return {
        recommendationType: 'escalation',
        summary: 'LLM response could not be parsed.',
        rootCause: 'Unable to determine root cause — LLM response was malformed.',
        complicationScore: 8,
        proposedChanges: null,
        educationContent: null,
        clarificationQuestions: null,
      };
    }
  }
}
