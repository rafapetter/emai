import type {
  Email,
  ClassificationResult,
  PriorityResult,
  ActionItem,
  SummaryResult,
} from '../core/types.js';
import type { AiEngine } from '../ai/index.js';
import type {
  TopicGroupingEngine,
  TopicGroupingResult,
} from '../ai/topic-grouping.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InboxProcessOptions {
  classify?: boolean;
  prioritize?: boolean;
  groupByTopic?: boolean;
  detectActions?: boolean;
  summarize?: boolean;
  focusedInbox?: boolean;
  vipList?: string[];
  focusThreshold?: number;
  userEmail?: string;
}

export interface EnrichedEmail {
  email: Email;
  classification?: ClassificationResult;
  priority?: PriorityResult;
  actions?: ActionItem[];
  summary?: SummaryResult;
  topics?: string[];
}

export interface InboxProcessResult {
  focused: EnrichedEmail[];
  other: EnrichedEmail[];
  groups?: TopicGroupingResult;
  urgent: EnrichedEmail[];
  digest?: string;
  stats: {
    total: number;
    focused: number;
    other: number;
    urgent: number;
    groupCount: number;
    processedAt: string;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FOCUSED_CATEGORIES = new Set([
  'primary',
  'personal',
  'work',
  'support',
  'billing',
]);

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class InboxEngine {
  async process(
    emails: Email[],
    aiEngine: AiEngine,
    topicEngine: TopicGroupingEngine,
    options: InboxProcessOptions = {},
  ): Promise<InboxProcessResult> {
    const opts: Required<InboxProcessOptions> = {
      classify: true,
      prioritize: true,
      groupByTopic: false,
      detectActions: false,
      summarize: false,
      focusedInbox: true,
      vipList: [],
      focusThreshold: 40,
      userEmail: '',
      ...options,
    };

    const enriched: EnrichedEmail[] = emails.map((e) => ({ email: e }));

    // Step 1: Classify + Prioritize in parallel
    const [classifications, priorities] = await Promise.all([
      opts.classify ? aiEngine.classifyEmails(emails) : null,
      opts.prioritize
        ? aiEngine.prioritizeEmails(emails, {
            userEmail: opts.userEmail || undefined,
            vipList: opts.vipList.length > 0 ? opts.vipList : undefined,
          })
        : null,
    ]);

    // Attach classification results
    if (classifications) {
      enriched.forEach((e, i) => {
        e.classification = classifications[i];
      });
    }

    // Attach priority results
    if (priorities) {
      for (const p of priorities) {
        const e = enriched.find((x) => x.email.id === p.email.id);
        if (e) e.priority = p.priority;
      }
    }

    // Step 2: Detect actions for high-priority emails only
    if (opts.detectActions) {
      const highPriority = enriched.filter(
        (e) =>
          e.priority &&
          (e.priority.level === 'critical' || e.priority.level === 'high'),
      );

      for (const e of highPriority) {
        try {
          e.actions = await aiEngine.detectActions(e.email);
        } catch {
          // Skip action detection failures for individual emails
        }
      }
    }

    // Step 3: Group by topic
    let groups: TopicGroupingResult | undefined;
    if (opts.groupByTopic) {
      try {
        groups = await topicEngine.groupByTopic(emails);
      } catch {
        // Skip topic grouping failures
      }

      if (groups) {
        for (const group of groups.groups) {
          for (const ge of group.emails) {
            const e = enriched.find((x) => x.email.id === ge.id);
            if (e) {
              e.topics = e.topics ?? [];
              e.topics.push(group.topic);
            }
          }
        }
      }
    }

    // Step 4: Sort into focused/other/urgent
    const focused: EnrichedEmail[] = [];
    const other: EnrichedEmail[] = [];
    const urgent: EnrichedEmail[] = [];
    const vipSet = new Set(opts.vipList.map((v) => v.toLowerCase()));

    for (const e of enriched) {
      const isFocused =
        (e.priority && e.priority.score >= opts.focusThreshold) ||
        (e.classification &&
          FOCUSED_CATEGORIES.has(e.classification.category)) ||
        vipSet.has(e.email.from.address.toLowerCase());

      const isUrgent =
        e.priority?.level === 'critical' ||
        (e.classification?.isUrgent ?? false);

      if (isUrgent) urgent.push(e);

      if (opts.focusedInbox) {
        if (isFocused) {
          focused.push(e);
        } else {
          other.push(e);
        }
      } else {
        focused.push(e);
      }
    }

    // Step 5: Generate digest summary
    let digest: string | undefined;
    if (opts.summarize && emails.length > 0) {
      try {
        digest = await aiEngine.summarizeEmails(emails);
      } catch {
        // Skip digest generation failures
      }
    }

    return {
      focused,
      other,
      groups,
      urgent,
      digest,
      stats: {
        total: emails.length,
        focused: focused.length,
        other: other.length,
        urgent: urgent.length,
        groupCount: groups?.groups.length ?? 0,
        processedAt: new Date().toISOString(),
      },
    };
  }
}
