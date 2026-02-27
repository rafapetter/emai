import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { ExtractEngine } from '../../../src/ai/extract.js';
import { createMockLLMAdapter } from '../../helpers/mock-llm-adapter.js';
import { makeEmail } from '../../helpers/fixtures.js';
import { AiError } from '../../../src/core/errors.js';
import type { LLMAdapter, ParsedAttachment } from '../../../src/core/types.js';

const OrderSchema = z.object({
  orderId: z.string(),
  amount: z.number(),
  currency: z.string(),
});

describe('ExtractEngine', () => {
  let mockAdapter: LLMAdapter & { completeJSON: ReturnType<typeof vi.fn> };
  let engine: ExtractEngine;

  const extractionResponse = {
    data: { orderId: 'ORD-123', amount: 99.99, currency: 'USD' },
    confidence: 0.95,
    sources: [
      { field: 'orderId', source: 'body', span: 'Order #ORD-123' },
      { field: 'amount', source: 'body', span: '$99.99' },
    ],
  };

  beforeEach(() => {
    mockAdapter = createMockLLMAdapter({
      completeJSONResponse: extractionResponse,
    });
    engine = new ExtractEngine(mockAdapter);
  });

  describe('extract', () => {
    it('extracts structured data from email', async () => {
      const email = makeEmail({
        body: { text: 'Your order #ORD-123 for $99.99 USD has been confirmed.' },
      });
      const result = await engine.extract(email, OrderSchema);
      expect(result.data).toEqual({ orderId: 'ORD-123', amount: 99.99, currency: 'USD' });
      expect(result.confidence).toBe(0.95);
      expect(result.sources).toHaveLength(2);
    });

    it('calls completeJSON with low temperature', async () => {
      await engine.extract(makeEmail(), OrderSchema);
      const options = mockAdapter.completeJSON.mock.calls[0][2];
      expect(options.temperature).toBe(0.1);
    });

    it('includes schema description in prompt', async () => {
      await engine.extract(makeEmail(), OrderSchema);
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('orderId');
      expect(prompt).toContain('amount');
      expect(prompt).toContain('currency');
    });

    it('includes text attachment references in prompt', async () => {
      const email = makeEmail({
        attachments: [
          { id: 'a1', filename: 'data.txt', contentType: 'text/plain', size: 100, isInline: false },
        ],
      });
      await engine.extract(email, OrderSchema);
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('data.txt');
    });

    it('throws AiError when extracted data fails schema validation', async () => {
      mockAdapter.completeJSON.mockResolvedValue({
        data: { orderId: 123, amount: 'not-a-number', currency: 'USD' },
        confidence: 0.5,
        sources: [],
      });
      await expect(engine.extract(makeEmail(), OrderSchema)).rejects.toThrow(AiError);
    });

    it('wraps adapter errors in AiError', async () => {
      mockAdapter.completeJSON.mockRejectedValue(new Error('API failed'));
      await expect(engine.extract(makeEmail(), OrderSchema)).rejects.toThrow(AiError);
      await expect(engine.extract(makeEmail(), OrderSchema)).rejects.toThrow('Extraction failed');
    });

    it('preserves AiError instances thrown internally', async () => {
      mockAdapter.completeJSON.mockRejectedValue(new AiError('Custom AI error'));
      await expect(engine.extract(makeEmail(), OrderSchema)).rejects.toThrow('Custom AI error');
    });
  });

  describe('extractFromAttachment', () => {
    const makeAttachmentParsed = (overrides: Partial<ParsedAttachment> = {}): ParsedAttachment => ({
      filename: 'invoice.pdf',
      contentType: 'application/pdf',
      size: 5000,
      text: 'Invoice #ORD-123\nTotal: $99.99 USD',
      ...overrides,
    });

    it('extracts data from attachment text', async () => {
      const result = await engine.extractFromAttachment(
        makeAttachmentParsed(),
        OrderSchema,
      );
      expect(result.data).toEqual({ orderId: 'ORD-123', amount: 99.99, currency: 'USD' });
    });

    it('includes filename in prompt', async () => {
      await engine.extractFromAttachment(makeAttachmentParsed(), OrderSchema);
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('invoice.pdf');
    });

    it('uses markdown content when text not available', async () => {
      await engine.extractFromAttachment(
        makeAttachmentParsed({ text: undefined, markdown: '# Invoice\n$99.99' }),
        OrderSchema,
      );
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('# Invoice');
    });

    it('includes table data when available', async () => {
      await engine.extractFromAttachment(
        makeAttachmentParsed({
          tables: [
            { headers: ['Item', 'Price'], rows: [['Widget', '$99.99']] },
          ],
        }),
        OrderSchema,
      );
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('Widget');
      expect(prompt).toContain('$99.99');
    });

    it('includes structured data when available', async () => {
      await engine.extractFromAttachment(
        makeAttachmentParsed({
          structuredData: { key: 'value' },
        }),
        OrderSchema,
      );
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('"key"');
      expect(prompt).toContain('"value"');
    });
  });
});
