import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Anthropic from '@anthropic-ai/sdk';
import { AnalysisService } from '../../analysis/analysis.service';
import { IssuesService } from '../issues.service';
import { ISSUES_EVENTS } from '../issues.constants';
import {
  IssueReceivedPayload,
  TriageLlmResponse,
} from '../issues.interfaces';

@Injectable()
export class TriageAgentService {
  private readonly logger = new Logger(TriageAgentService.name);
  private client: Anthropic | null = null;
  private readonly model: string;
  private readonly maxRetries = 2;

  constructor(
    private configService: ConfigService,
    private analysisService: AnalysisService,
    private issuesService: IssuesService,
    private eventEmitter: EventEmitter2,
  ) {
    const apiKey = this.configService.get<string>('LLM_API_KEY');
    this.model = this.configService.get<string>('LLM_MODEL', 'claude-sonnet-4-5-20250929');

    if (apiKey) {
      this.client = new Anthropic({ apiKey });
      this.logger.log('Triage agent LLM initialized');
    } else {
      this.logger.warn('LLM_API_KEY not set — triage will fallback to needs-review');
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  @OnEvent(ISSUES_EVENTS.ISSUE_RECEIVED)
  async handleIssueReceived(payload: IssueReceivedPayload): Promise<void> {
    this.logger.log(`Triaging issue ${payload.issueId} for project ${payload.projectId}`);

    try {
      if (!this.isAvailable()) {
        this.logger.warn('LLM not available, marking issue as needs-review');
        await this.issuesService.updateIssue(payload.issueId, {
          status: 'needs-review',
          triageNotes: 'LLM service unavailable — manual triage required.',
        });
        return;
      }

      const issue = await this.issuesService.findById(payload.issueId, payload.projectId);
      const analysis = await this.analysisService.findByProjectId(payload.projectId);
      const featureAreas = this.extractFeatureAreas(analysis);

      if (featureAreas.length === 0) {
        await this.issuesService.updateIssue(payload.issueId, {
          status: 'needs-review',
          triageNotes: 'No codebase analysis available — cannot auto-triage. Run analysis first.',
        });
        return;
      }

      const architectureSummary = this.extractArchitectureSummary(analysis);
      const result = await this.classifyIssue(
        issue.reporterEmail,
        issue.subject,
        issue.description,
        featureAreas,
        architectureSummary,
      );

      if (!result.isTriageable || result.confidence < 0.4) {
        await this.issuesService.updateIssue(payload.issueId, {
          status: 'needs-review',
          triageNotes: result.triageNotes || 'Issue could not be confidently triaged.',
          triageConfidence: result.confidence,
        });
        return;
      }

      let triageNotes = result.triageNotes;
      if (result.confidence >= 0.4 && result.confidence <= 0.7) {
        triageNotes = `[Low confidence] ${triageNotes}`;
      }

      await this.issuesService.updateIssue(payload.issueId, {
        status: 'triaged',
        priority: result.priority,
        assignedArea: result.assignedArea,
        triageNotes,
        triageConfidence: result.confidence,
      });

      this.logger.log(
        `Issue ${payload.issueId} triaged: area=${result.assignedArea} priority=${result.priority} confidence=${result.confidence}`,
      );

      this.eventEmitter.emit(ISSUES_EVENTS.ISSUE_TRIAGED, {
        issueId: payload.issueId,
        projectId: payload.projectId,
        assignedArea: result.assignedArea,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Triage failed for issue ${payload.issueId}: ${message}`);

      await this.issuesService.updateIssue(payload.issueId, {
        status: 'needs-review',
        triageNotes: `Triage error: ${message}`,
      });
    }
  }

  extractFeatureAreas(analysis: Awaited<ReturnType<AnalysisService['findByProjectId']>>): string[] {
    if (!analysis) return [];

    const areas = new Set<string>();

    if (analysis.llmIntelligence) {
      const intel = analysis.llmIntelligence as { businessFlows?: { name: string }[] };
      intel.businessFlows?.forEach((f) => areas.add(f.name));
    }

    if (analysis.fileRegistry) {
      const files = analysis.fileRegistry as { llm?: { feature: string } }[];
      files.forEach((f) => {
        if (f.llm?.feature) areas.add(f.llm.feature);
      });
    }

    return Array.from(areas).sort();
  }

  private extractArchitectureSummary(
    analysis: Awaited<ReturnType<AnalysisService['findByProjectId']>>,
  ): string {
    if (!analysis?.llmIntelligence) return 'No architecture summary available.';

    const intel = analysis.llmIntelligence as {
      architectureSummary?: string;
      techStackNarrative?: string;
    };

    return [
      intel.architectureSummary || '',
      intel.techStackNarrative || '',
    ]
      .filter(Boolean)
      .join('\n\n') || 'No architecture summary available.';
  }

  private async classifyIssue(
    reporterEmail: string,
    subject: string,
    description: string,
    featureAreas: string[],
    architectureSummary: string,
  ): Promise<TriageLlmResponse> {
    const systemPrompt = `You are an issue triage agent for a software project. Your job is to classify incoming customer-reported issues into the correct feature area and assign a priority.

Available feature areas:
${featureAreas.map((a) => `- ${a}`).join('\n')}

Architecture context:
${architectureSummary}

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "assignedArea": "one of the feature areas listed above",
  "priority": "critical|high|medium|low",
  "triageNotes": "Brief explanation of why this area and priority were chosen, and any initial analysis",
  "confidence": 0.0 to 1.0,
  "isTriageable": true or false
}

Rules:
- assignedArea MUST be one of the listed feature areas (exact match)
- priority: critical = service down/data loss, high = major feature broken, medium = degraded UX, low = cosmetic/minor
- confidence: 0.0 = no idea, 1.0 = certain. Be honest about uncertainty.
- isTriageable: false if the issue is spam, too vague to classify, or not a real bug report
- triageNotes: provide context that will help the diagnosis agent understand the issue`;

    const userMessage = `Reporter: ${reporterEmail}
Subject: ${subject}

Description:
${description}`;

    const response = await this.callWithRetry(systemPrompt, userMessage);
    return this.parseTriageResponse(response);
  }

  private async callWithRetry(systemPrompt: string, userMessage: string): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client!.messages.create({
          model: this.model,
          max_tokens: 1024,
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

  private parseTriageResponse(response: string): TriageLlmResponse {
    try {
      const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;

      return {
        assignedArea: String(parsed.assignedArea || 'unknown'),
        priority: this.validatePriority(parsed.priority),
        triageNotes: String(parsed.triageNotes || ''),
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        isTriageable: parsed.isTriageable !== false,
      };
    } catch {
      this.logger.warn('Failed to parse triage LLM response, defaulting to needs-review');
      return {
        assignedArea: 'unknown',
        priority: 'medium',
        triageNotes: 'LLM response could not be parsed.',
        confidence: 0,
        isTriageable: false,
      };
    }
  }

  private validatePriority(value: unknown): 'critical' | 'high' | 'medium' | 'low' {
    const valid = ['critical', 'high', 'medium', 'low'];
    return valid.includes(String(value)) ? (String(value) as 'critical' | 'high' | 'medium' | 'low') : 'medium';
  }
}
