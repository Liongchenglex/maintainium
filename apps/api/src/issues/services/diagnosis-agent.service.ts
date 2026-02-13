import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import Anthropic from '@anthropic-ai/sdk';
import { eq, and, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/database.module';
import { issueDiagnoses, reportedIssues } from '../../database/schema';
import { AnalysisService } from '../../analysis/analysis.service';
import { IssuesService } from '../issues.service';
import { EmbeddingService } from './embedding.service';
import { ISSUES_EVENTS } from '../issues.constants';
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

  @OnEvent(ISSUES_EVENTS.ISSUE_TRIAGED)
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

  private async diagnoseIssue(
    reporterEmail: string,
    subject: string,
    description: string,
    triageNotes: string,
    assignedArea: string,
    areaFiles: string[],
    similarIssues: { content: string; similarity: number }[],
  ): Promise<DiagnosisLlmResponse> {
    const similarContext =
      similarIssues.length > 0
        ? `\n\nSimilar past issues (from vector memory):\n${similarIssues.map((s, i) => `${i + 1}. (similarity: ${s.similarity.toFixed(3)})\n${s.content}`).join('\n\n')}`
        : '';

    const filesContext =
      areaFiles.length > 0
        ? `\n\nRelevant files in the "${assignedArea}" area:\n${areaFiles.map((f) => `- ${f}`).join('\n')}`
        : '';

    const systemPrompt = `You are a diagnosis agent for a software project. Given a customer-reported issue that has been triaged to the "${assignedArea}" feature area, analyze the issue and provide a detailed diagnosis.
${filesContext}${similarContext}

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
- clarificationQuestions: only for "needs-clarification" — list specific questions to ask the reporter`;

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
          max_tokens: 4096,
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
