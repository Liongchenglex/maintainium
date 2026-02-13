import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/database.module';

interface SimilarMemory {
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly apiKey: string | undefined;
  private readonly maxRetries = 2;

  constructor(
    private configService: ConfigService,
    @Inject(DRIZZLE) private db: DrizzleDB,
  ) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (this.apiKey) {
      this.logger.log('Embedding service initialized (OpenAI text-embedding-3-small)');
    } else {
      this.logger.warn('OPENAI_API_KEY not set — vector memory disabled');
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: text,
          }),
        });

        if (!response.ok) {
          const body = await response.text();
          if (response.status === 429) {
            const delay = Math.pow(2, attempt) * 1000;
            this.logger.warn(`OpenAI rate limited, retrying in ${delay}ms`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          throw new Error(`OpenAI API error ${response.status}: ${body}`);
        }

        const data = (await response.json()) as {
          data: Array<{ embedding: number[] }>;
        };

        return data.data[0].embedding;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (lastError.message.includes('429') || lastError.message.includes('rate')) {
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.warn(`Rate limited, retrying in ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Embedding call failed after retries');
  }

  async storeEmbedding(
    projectId: string,
    featureArea: string,
    contentType: string,
    content: string,
    embedding: number[],
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const vectorStr = `[${embedding.join(',')}]`;

    await this.db.execute(
      sql`INSERT INTO agent_memory_embeddings (project_id, feature_area, content_type, content, embedding, metadata)
          VALUES (${projectId}, ${featureArea}, ${contentType}, ${content}, ${vectorStr}::vector, ${JSON.stringify(metadata)}::jsonb)`,
    );

    this.logger.debug(`Stored ${contentType} embedding for area ${featureArea}`);
  }

  async findSimilar(
    projectId: string,
    featureArea: string,
    embedding: number[],
    limit = 3,
  ): Promise<SimilarMemory[]> {
    const vectorStr = `[${embedding.join(',')}]`;

    const result = await this.db.execute(
      sql`SELECT content, metadata, 1 - (embedding <=> ${vectorStr}::vector) AS similarity
          FROM agent_memory_embeddings
          WHERE project_id = ${projectId} AND feature_area = ${featureArea}
          ORDER BY embedding <=> ${vectorStr}::vector
          LIMIT ${limit}`,
    );

    return (result.rows ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        content: String(r.content || ''),
        metadata: r.metadata as Record<string, unknown> | null,
        similarity: Number(r.similarity || 0),
      };
    });
  }
}
