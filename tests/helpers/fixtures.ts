import type {
  Email,
  Thread,
  Attachment,
  EmailAddress,
  ClassificationResult,
  SummaryResult,
  PriorityResult,
  ComposeResult,
  ActionItem,
} from '../../src/core/types.js';

// ---- Email Addresses ----

export const ALICE: EmailAddress = { name: 'Alice Smith', address: 'alice@example.com' };
export const BOB: EmailAddress = { name: 'Bob Jones', address: 'bob@example.com' };
export const CAROL: EmailAddress = { name: 'Carol Davis', address: 'carol@company.com' };
export const NOREPLY: EmailAddress = { address: 'noreply@marketing.com' };

// ---- Factory Functions ----

export function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'email-1',
    provider: 'gmail',
    from: ALICE,
    to: [BOB],
    cc: [],
    bcc: [],
    subject: 'Test Email Subject',
    body: {
      text: 'Hello Bob, this is a test email with important information.',
      html: '<p>Hello Bob, this is a test email with important information.</p>',
    },
    attachments: [],
    labels: ['inbox'],
    folder: 'inbox',
    date: new Date('2025-01-15T10:00:00Z'),
    receivedDate: new Date('2025-01-15T10:00:00Z'),
    isRead: false,
    isStarred: false,
    isDraft: false,
    headers: { messageId: '<msg-1@example.com>' },
    snippet: 'Hello Bob, this is a test...',
    ...overrides,
  };
}

export function makeThread(overrides: Partial<Thread> = {}): Thread {
  const email1 = makeEmail({
    id: 'e1',
    threadId: 'thread-1',
    date: new Date('2025-01-15T10:00:00Z'),
  });
  const email2 = makeEmail({
    id: 'e2',
    threadId: 'thread-1',
    from: BOB,
    to: [ALICE],
    date: new Date('2025-01-15T11:00:00Z'),
    headers: { messageId: '<msg-2@example.com>', inReplyTo: '<msg-1@example.com>' },
    body: { text: 'Thanks Alice, I received the information.' },
  });
  return {
    id: 'thread-1',
    subject: 'Test Email Subject',
    emails: [email1, email2],
    participants: [ALICE, BOB],
    lastDate: new Date('2025-01-15T11:00:00Z'),
    messageCount: 2,
    labels: ['inbox'],
    snippet: 'Thanks Alice...',
    ...overrides,
  };
}

export function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'att-1',
    filename: 'document.txt',
    contentType: 'text/plain',
    size: 100,
    content: Buffer.from('Sample text content'),
    isInline: false,
    ...overrides,
  };
}

export function makeEmails(count: number): Email[] {
  return Array.from({ length: count }, (_, i) =>
    makeEmail({
      id: `email-${i + 1}`,
      subject: `Test Email ${i + 1}`,
      date: new Date(Date.UTC(2025, 0, 15 + i, 10, 0, 0)),
      headers: { messageId: `<msg-${i + 1}@example.com>` },
    }),
  );
}

// ---- Special Emails for Safety Testing ----

export const PHISHING_EMAIL = makeEmail({
  id: 'phish-1',
  from: { address: 'security@paypa1.com' },
  subject: 'Your account has been suspended - verify immediately',
  body: {
    text: 'Act now! Your account has been suspended. Verify your account immediately or it will be closed.',
    html: '<a href="http://evil.com/steal">http://paypal.com/verify</a>',
  },
});

export const PII_EMAIL = makeEmail({
  id: 'pii-1',
  body: { text: 'My SSN is 123-45-6789 and my phone is (555) 123-4567.' },
});

export const CREDENTIAL_EMAIL = makeEmail({
  id: 'cred-1',
  body: { text: 'The API key is sk-abcdefghijklmnopqrstuvwxyz123456789012345678. Do not share.' },
});

// ---- Canned AI Responses ----

export const CLASSIFICATION_RESPONSE: ClassificationResult = {
  category: 'work',
  confidence: 0.92,
  reasoning: 'Business-related content from known work contact',
  labels: ['work', 'important'],
  sentiment: 'neutral',
  isUrgent: false,
  isActionRequired: true,
};

export const SUMMARY_RESPONSE: SummaryResult = {
  summary: 'Alice sent Bob important test information.',
  keyPoints: ['Test information shared'],
  participants: [{ address: 'alice@example.com', name: 'Alice Smith' }],
  actionItems: [],
  sentiment: 'neutral',
  topicTags: ['test'],
};

export const PRIORITY_RESPONSE: PriorityResult = {
  score: 65,
  level: 'high',
  reasoning: 'Direct email from known contact with action required',
  suggestedResponseTime: 'within 4 hours',
};

export const ACTIONS_RESPONSE: { actions: ActionItem[] } = {
  actions: [
    {
      description: 'Review the attached document',
      assignee: 'bob@example.com',
      priority: 'medium',
      status: 'pending',
    },
  ],
};

export const COMPOSE_RESPONSE: ComposeResult = {
  subject: 'Re: Test Email Subject',
  text: 'Thank you for reaching out. I will review the information.',
  html: '<p>Thank you for reaching out. I will review the information.</p>',
};
