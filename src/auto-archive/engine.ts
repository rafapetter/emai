import { z } from 'zod';
import type { Email, LLMAdapter, StorageAdapter } from '../core/types.js';
import { AiError } from '../core/errors.js';
import { emailToPlainText, truncate, cosineSimilarity } from '../core/utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoArchiveEvaluation {
  shouldArchive: boolean;
  confidence: number;
  reason: string;
}

interface AutoArchiveModel {
  archivedCentroid: number[];
  keptCentroid: number[];
  archivedPatterns: string;
  keptPatterns: string;
  trainedAt: string;
}

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const PatternAnalysisSchema = z.object({
  archivedPatterns: z.string(),
  keptPatterns: z.string(),
});

const ArchiveDecisionSchema = z.object({
  shouldArchive: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'autoarchive:model';
const SIMILARITY_THRESHOLD = 0.15;

const PATTERN_SYSTEM_PROMPT = `You are an expert at analyzing email archiving behavior. Given examples of archived and kept emails, identify the patterns that distinguish them.

Guidelines:
- Look for sender patterns (newsletters, automated emails, marketing)
- Look for content patterns (notifications, receipts, personal messages)
- Look for subject line patterns (keywords, formats)
- Describe patterns concisely and clearly
- Focus on actionable distinguishing features`;

const ARCHIVE_DECISION_SYSTEM_PROMPT = `You are an email archiving assistant. Based on learned patterns from the user's past behavior, decide whether a new email should be archived or kept in the inbox.

Guidelines:
- Consider the patterns from both archived and kept emails
- Be conservative — when in doubt, keep in inbox
- Confidence should reflect how clearly the email matches one pattern set
- Provide a brief, clear reason for the decision`;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class AutoArchiveEngine {
  constructor(
    private readonly adapter: LLMAdapter,
    private readonly storage: StorageAdapter,
  ) {}

  async train(archivedEmails: Email[], keptEmails: Email[]): Promise<void> {
    if (archivedEmails.length === 0 && keptEmails.length === 0) {
      throw new AiError('At least one archived or kept email is required for training');
    }

    // Step 1: Generate embeddings for both sets
    const archivedTexts = archivedEmails.map((e) =>
      truncate(emailToPlainText(e), 500),
    );
    const keptTexts = keptEmails.map((e) =>
      truncate(emailToPlainText(e), 500),
    );

    let archivedEmbeddings: number[][] = [];
    let keptEmbeddings: number[][] = [];

    try {
      if (archivedTexts.length > 0) {
        archivedEmbeddings = await this.adapter.embed(archivedTexts);
      }
      if (keptTexts.length > 0) {
        keptEmbeddings = await this.adapter.embed(keptTexts);
      }
    } catch (err) {
      throw new AiError(
        `Failed to embed emails for training: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    // Step 2: Compute centroids
    const archivedCentroid = computeCentroid(archivedEmbeddings);
    const keptCentroid = computeCentroid(keptEmbeddings);

    // Step 3: Ask LLM to describe patterns
    const archivedSamples = archivedEmails
      .slice(0, 10)
      .map((e, i) => `${i + 1}. Subject: ${e.subject} | From: ${e.from.address}`)
      .join('\n');
    const keptSamples = keptEmails
      .slice(0, 10)
      .map((e, i) => `${i + 1}. Subject: ${e.subject} | From: ${e.from.address}`)
      .join('\n');

    const prompt = `Analyze these email samples and describe the patterns for each group.

Archived emails (${archivedEmails.length} total):
${archivedSamples || '(none provided)'}

Kept emails (${keptEmails.length} total):
${keptSamples || '(none provided)'}

Return JSON with:
- archivedPatterns: description of common patterns in archived emails
- keptPatterns: description of common patterns in kept emails`;

    let patterns: z.infer<typeof PatternAnalysisSchema>;
    try {
      patterns = await this.adapter.completeJSON(
        prompt,
        PatternAnalysisSchema,
        { systemPrompt: PATTERN_SYSTEM_PROMPT, temperature: 0.2 },
      );
    } catch (err) {
      throw new AiError(
        `Failed to analyze archiving patterns: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    // Step 4: Store model
    const model: AutoArchiveModel = {
      archivedCentroid,
      keptCentroid,
      archivedPatterns: patterns.archivedPatterns,
      keptPatterns: patterns.keptPatterns,
      trainedAt: new Date().toISOString(),
    };

    await this.storage.setMetadata(STORAGE_KEY, JSON.stringify(model));
  }

  async evaluate(email: Email): Promise<AutoArchiveEvaluation> {
    // Step 1: Load model
    const raw = await this.storage.getMetadata(STORAGE_KEY);
    if (!raw) {
      return {
        shouldArchive: false,
        confidence: 0,
        reason: 'No auto-archive model trained yet. Call train() first.',
      };
    }

    const model = JSON.parse(raw) as AutoArchiveModel;

    // Step 2: Embed the email
    const text = truncate(emailToPlainText(email), 500);
    let embedding: number[];
    try {
      const embeddings = await this.adapter.embed([text]);
      embedding = embeddings[0];
    } catch (err) {
      throw new AiError(
        `Failed to embed email for evaluation: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    // Step 3: Compute similarity to each centroid
    const archivedSim =
      model.archivedCentroid.length > 0
        ? cosineSimilarity(embedding, model.archivedCentroid)
        : 0;
    const keptSim =
      model.keptCentroid.length > 0
        ? cosineSimilarity(embedding, model.keptCentroid)
        : 0;

    const diff = archivedSim - keptSim;

    // Step 4: If clear winner, return based on embedding similarity
    if (Math.abs(diff) > SIMILARITY_THRESHOLD) {
      const shouldArchive = diff > 0;
      return {
        shouldArchive,
        confidence: Math.min(Math.abs(diff) * 2, 1),
        reason: shouldArchive
          ? `Email is similar to previously archived emails (similarity difference: ${diff.toFixed(3)})`
          : `Email is similar to previously kept emails (similarity difference: ${diff.toFixed(3)})`,
      };
    }

    // Step 5: Ambiguous — ask LLM with pattern context
    const prompt = `Decide whether this email should be archived or kept in the inbox.

Email:
Subject: ${email.subject}
From: ${email.from.address}
Body: ${truncate(email.body.text || email.snippet || '', 300)}

User's archiving patterns:
- Archived emails tend to be: ${model.archivedPatterns}
- Kept emails tend to be: ${model.keptPatterns}

Return JSON with:
- shouldArchive: boolean
- confidence: 0.0-1.0
- reason: brief explanation`;

    try {
      return await this.adapter.completeJSON(
        prompt,
        ArchiveDecisionSchema,
        { systemPrompt: ARCHIVE_DECISION_SYSTEM_PROMPT, temperature: 0.1 },
      );
    } catch (err) {
      throw new AiError(
        `Failed to evaluate email for archiving: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  async processInbox(
    emails: Email[],
  ): Promise<{ archive: Email[]; keep: Email[] }> {
    const archive: Email[] = [];
    const keep: Email[] = [];

    for (const email of emails) {
      try {
        const evaluation = await this.evaluate(email);
        if (evaluation.shouldArchive) {
          archive.push(email);
        } else {
          keep.push(email);
        }
      } catch {
        // On failure, default to keeping the email
        keep.push(email);
      }
    }

    return { archive, keep };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];

  const dim = embeddings[0].length;
  const centroid = new Array<number>(dim).fill(0);

  for (const vec of embeddings) {
    for (let d = 0; d < dim; d++) {
      centroid[d] += vec[d];
    }
  }

  for (let d = 0; d < dim; d++) {
    centroid[d] /= embeddings.length;
  }

  return centroid;
}
