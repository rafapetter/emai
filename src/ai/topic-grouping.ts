import { z } from 'zod';
import type { Email, LLMAdapter } from '../core/types.js';
import { AiError } from '../core/errors.js';
import { emailToPlainText, truncate, cosineSimilarity } from '../core/utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TopicGroup {
  topic: string;
  description: string;
  emails: Email[];
  confidence: number;
}

export interface TopicGroupingResult {
  groups: TopicGroup[];
  ungrouped: Email[];
}

export interface CategorySuggestion {
  name: string;
  description: string;
  matchingEmailCount: number;
  exampleSubjects: string[];
}

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const TopicNameSchema = z.object({
  topic: z.string(),
  description: z.string(),
  confidence: z.number().min(0).max(1),
});

const TopicsSchema = z.object({
  topics: z.array(z.string()).min(1).max(5),
});

const CategorySuggestionsSchema = z.object({
  categories: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// System Prompts
// ---------------------------------------------------------------------------

const TOPIC_NAMING_SYSTEM_PROMPT = `You are an expert at identifying and naming email topics. Given a set of representative emails from a cluster, determine a concise, descriptive topic name and a brief description of what the emails in this group have in common.

Guidelines:
- Topic names should be 2-5 words, clear, and specific
- Descriptions should be one sentence explaining the common thread
- Confidence should reflect how cohesive the group is (0.0-1.0)`;

const TOPIC_EXTRACTION_SYSTEM_PROMPT = `You are an expert at identifying topics in email content. Extract the main topics discussed in the given email.

Guidelines:
- Return 1-5 relevant topics
- Topics should be specific but not overly granular
- Use short, descriptive phrases (2-4 words each)
- Order topics by relevance (most relevant first)`;

const CATEGORY_SYSTEM_PROMPT = `You are an expert at organizing emails into meaningful categories. Given topic groups with example emails, suggest clear, user-friendly category names and descriptions.

Guidelines:
- Category names should be intuitive and actionable
- Descriptions should help users understand what goes in each category
- Consider merging very similar topics into broader categories`;

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

function computeCentroid(embeddings: number[][], indices: number[]): number[] {
  if (indices.length === 0) return [];
  const dim = embeddings[indices[0]].length;
  const centroid = new Array<number>(dim).fill(0);

  for (const idx of indices) {
    const vec = embeddings[idx];
    for (let d = 0; d < dim; d++) {
      centroid[d] += vec[d];
    }
  }

  for (let d = 0; d < dim; d++) {
    centroid[d] /= indices.length;
  }

  return centroid;
}

function clusterSimilarity(
  embeddings: number[][],
  clusterA: number[],
  clusterB: number[],
): number {
  const centroidA = computeCentroid(embeddings, clusterA);
  const centroidB = computeCentroid(embeddings, clusterB);
  return cosineSimilarity(centroidA, centroidB);
}

function agglomerativeCluster(
  embeddings: number[][],
  threshold: number,
  maxClusters: number,
): number[][] {
  // Each item starts as its own cluster
  let clusters: number[][] = embeddings.map((_, i) => [i]);

  while (clusters.length > 1) {
    // If we've reached the max clusters limit, stop
    if (clusters.length <= maxClusters) {
      // Only continue if we can still find pairs above threshold
    }

    let bestSim = -Infinity;
    let bestI = -1;
    let bestJ = -1;

    // Find the two closest clusters
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = clusterSimilarity(embeddings, clusters[i], clusters[j]);
        if (sim > bestSim) {
          bestSim = sim;
          bestI = i;
          bestJ = j;
        }
      }
    }

    // Stop if the best similarity is below the threshold
    if (bestSim < threshold) break;

    // Merge the two closest clusters
    const merged = [...clusters[bestI], ...clusters[bestJ]];
    clusters = clusters.filter((_, idx) => idx !== bestI && idx !== bestJ);
    clusters.push(merged);
  }

  return clusters;
}

function findRepresentatives(
  embeddings: number[][],
  indices: number[],
  count: number,
): number[] {
  if (indices.length <= count) return [...indices];

  const centroid = computeCentroid(embeddings, indices);
  const scored = indices.map((idx) => ({
    idx,
    similarity: cosineSimilarity(embeddings[idx], centroid),
  }));
  scored.sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, count).map((s) => s.idx);
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class TopicGroupingEngine {
  constructor(private readonly adapter: LLMAdapter) {}

  async groupByTopic(
    emails: Email[],
    options?: { maxGroups?: number },
  ): Promise<TopicGroupingResult> {
    if (emails.length === 0) {
      return { groups: [], ungrouped: [] };
    }

    if (emails.length === 1) {
      return { groups: [], ungrouped: [...emails] };
    }

    const maxGroups = options?.maxGroups ?? 10;

    // Step 1: Get text for each email and truncate
    const texts = emails.map((e) => truncate(emailToPlainText(e), 500));

    // Step 2: Embed all texts
    let embeddings: number[][];
    try {
      embeddings = await this.adapter.embed(texts);
    } catch (err) {
      throw new AiError(
        `Failed to embed emails for topic grouping: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    // Step 3: Cluster using agglomerative clustering
    const clusters = agglomerativeCluster(embeddings, 0.65, maxGroups);

    // Step 4: Separate single-item clusters (ungrouped) from real groups
    const realClusters = clusters.filter((c) => c.length >= 2);
    const singletons = clusters.filter((c) => c.length === 1);
    const ungroupedIndices = new Set(singletons.map((c) => c[0]));

    // Step 5: For each cluster, name the topic via LLM
    const groups: TopicGroup[] = [];

    for (const cluster of realClusters) {
      const representatives = findRepresentatives(embeddings, cluster, 3);
      const repTexts = representatives
        .map((idx, i) => `--- Email ${i + 1} ---\n${texts[idx]}`)
        .join('\n\n');

      const prompt = `Name the topic for this group of ${cluster.length} related emails. Here are ${representatives.length} representative examples:

${repTexts}

Return JSON with:
- topic: concise topic name (2-5 words)
- description: one-sentence description of what these emails share
- confidence: how cohesive this group is (0.0-1.0)`;

      try {
        const result = await this.adapter.completeJSON(
          prompt,
          TopicNameSchema,
          { systemPrompt: TOPIC_NAMING_SYSTEM_PROMPT, temperature: 0.2 },
        );

        groups.push({
          topic: result.topic,
          description: result.description,
          emails: cluster.map((idx) => emails[idx]),
          confidence: result.confidence,
        });
      } catch {
        // If naming fails, still include the group with a generic name
        groups.push({
          topic: `Group ${groups.length + 1}`,
          description: 'Topic naming unavailable',
          emails: cluster.map((idx) => emails[idx]),
          confidence: 0,
        });
      }
    }

    // Sort groups by size (largest first)
    groups.sort((a, b) => b.emails.length - a.emails.length);

    const ungrouped = emails.filter((_, idx) => ungroupedIndices.has(idx));

    return { groups, ungrouped };
  }

  async extractTopics(email: Email): Promise<string[]> {
    const text = truncate(emailToPlainText(email), 3000);

    const prompt = `Extract the main topics from this email:

${text}

Return JSON with:
- topics: array of 1-5 topic strings, ordered by relevance`;

    try {
      const result = await this.adapter.completeJSON(
        prompt,
        TopicsSchema,
        { systemPrompt: TOPIC_EXTRACTION_SYSTEM_PROMPT, temperature: 0.1 },
      );
      return result.topics;
    } catch (err) {
      throw new AiError(
        `Failed to extract topics: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  async suggestCategories(emails: Email[]): Promise<CategorySuggestion[]> {
    if (emails.length === 0) return [];

    // First, group by topic to understand the landscape
    const grouping = await this.groupByTopic(emails);

    if (grouping.groups.length === 0) return [];

    // Build summary of groups for LLM
    const groupSummaries = grouping.groups
      .map((g, i) => {
        const subjects = g.emails
          .slice(0, 3)
          .map((e) => e.subject)
          .join(', ');
        return `Group ${i + 1}: "${g.topic}" (${g.emails.length} emails) — ${g.description}\n  Example subjects: ${subjects}`;
      })
      .join('\n');

    const prompt = `Based on these email topic groups, suggest user-friendly category names:

${groupSummaries}

${grouping.ungrouped.length > 0 ? `There are also ${grouping.ungrouped.length} ungrouped emails.` : ''}

Return JSON with:
- categories: array of { name, description } for suggested categories. You may merge similar groups or split large ones.`;

    try {
      const result = await this.adapter.completeJSON(
        prompt,
        CategorySuggestionsSchema,
        { systemPrompt: CATEGORY_SYSTEM_PROMPT, temperature: 0.3 },
      );

      // Map category suggestions back to email data
      return result.categories.map((cat) => {
        // Find the matching group(s) for this category
        const matchingGroups = grouping.groups.filter(
          (g) =>
            g.topic.toLowerCase().includes(cat.name.toLowerCase()) ||
            cat.name.toLowerCase().includes(g.topic.toLowerCase()) ||
            cat.description.toLowerCase().includes(g.topic.toLowerCase()),
        );

        const matchingEmails =
          matchingGroups.length > 0
            ? matchingGroups.flatMap((g) => g.emails)
            : [];

        return {
          name: cat.name,
          description: cat.description,
          matchingEmailCount: matchingEmails.length,
          exampleSubjects: matchingEmails
            .slice(0, 5)
            .map((e) => e.subject),
        };
      });
    } catch (err) {
      throw new AiError(
        `Failed to suggest categories: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }
}
