import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttachmentParser, createAttachmentParser } from '../../../src/attachments/parser.js';
import { makeAttachment } from '../../helpers/fixtures.js';
import { EmaiError, AdapterNotConfiguredError } from '../../../src/core/errors.js';
import { createMockLLMAdapter } from '../../helpers/mock-llm-adapter.js';

// Mock the sub-parsers to avoid requiring optional dependencies
vi.mock('../../../src/attachments/pdf.js', () => ({
  PdfParser: class {
    async parse() {
      return {
        filename: 'doc.pdf',
        contentType: 'application/pdf',
        size: 100,
        text: 'PDF text content',
      };
    }
  },
}));

vi.mock('../../../src/attachments/image.js', () => ({
  ImageParser: class {
    async parse() {
      return {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        size: 100,
        text: 'Image OCR text',
      };
    }
    async describe() {
      return 'A photo of a cat';
    }
    async ocr() {
      return 'OCR extracted text';
    }
  },
}));

vi.mock('../../../src/attachments/office.js', () => ({
  OfficeParser: class {
    async parse() {
      return {
        filename: 'report.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 100,
        text: 'Office document text',
      };
    }
  },
}));

vi.mock('../../../src/attachments/csv.js', () => ({
  CsvParser: class {
    async parse() {
      return {
        filename: 'data.csv',
        contentType: 'text/csv',
        size: 100,
        text: 'CSV data',
        tables: [{ headers: ['A', 'B'], rows: [['1', '2']] }],
      };
    }
  },
}));

vi.mock('../../../src/attachments/video.js', () => ({
  VideoParser: class {
    async parse() {
      return {
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        size: 100,
        text: 'Video transcript',
      };
    }
    async parseDeep() {
      return { text: 'Detailed video description' };
    }
  },
}));

describe('AttachmentParser', () => {
  let parser: AttachmentParser;

  beforeEach(() => {
    parser = new AttachmentParser();
  });

  describe('parse', () => {
    it('routes PDF to PdfParser', async () => {
      const attachment = makeAttachment({
        filename: 'doc.pdf',
        contentType: 'application/pdf',
      });
      const result = await parser.parse(attachment);
      expect(result.filename).toBe('doc.pdf');
      expect(result.contentType).toBe('application/pdf');
    });

    it('routes images to ImageParser', async () => {
      const attachment = makeAttachment({
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });
      const result = await parser.parse(attachment);
      expect(result.filename).toBe('photo.jpg');
    });

    it('routes Office documents to OfficeParser', async () => {
      const attachment = makeAttachment({
        filename: 'report.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const result = await parser.parse(attachment);
      expect(result.filename).toBe('report.docx');
    });

    it('routes CSV to CsvParser', async () => {
      const attachment = makeAttachment({
        filename: 'data.csv',
        contentType: 'text/csv',
      });
      const result = await parser.parse(attachment);
      expect(result.filename).toBe('data.csv');
    });

    it('routes video to VideoParser', async () => {
      const attachment = makeAttachment({
        filename: 'clip.mp4',
        contentType: 'video/mp4',
      });
      const result = await parser.parse(attachment);
      expect(result.filename).toBe('clip.mp4');
    });

    it('parses plain text directly', async () => {
      const attachment = makeAttachment({
        filename: 'notes.txt',
        contentType: 'text/plain',
        content: Buffer.from('Hello, world!'),
      });
      const result = await parser.parse(attachment);
      expect(result.text).toBe('Hello, world!');
      expect(result.filename).toBe('notes.txt');
    });

    it('parses HTML text directly', async () => {
      const attachment = makeAttachment({
        filename: 'page.html',
        contentType: 'text/html',
        content: Buffer.from('<p>Hello</p>'),
      });
      const result = await parser.parse(attachment);
      expect(result.text).toBe('<p>Hello</p>');
    });

    it('handles unknown binary content type', async () => {
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF]);
      const attachment = makeAttachment({
        filename: 'data.bin',
        contentType: 'application/octet-stream',
        content: binaryContent,
      });
      const result = await parser.parse(attachment);
      expect(result.text).toContain('Binary content');
    });

    it('throws when attachment has no content', async () => {
      const attachment = makeAttachment({ content: undefined });
      await expect(parser.parse(attachment)).rejects.toThrow(EmaiError);
      await expect(parser.parse(attachment)).rejects.toThrow('no content');
    });

    it('sets filename, contentType, size from attachment', async () => {
      const attachment = makeAttachment({
        filename: 'readme.txt',
        contentType: 'text/plain',
        size: 42,
        content: Buffer.from('Hi'),
      });
      const result = await parser.parse(attachment);
      expect(result.filename).toBe('readme.txt');
      expect(result.contentType).toBe('text/plain');
      expect(result.size).toBe(42);
    });

    it('routes vnd.ms-excel to CsvParser', async () => {
      const attachment = makeAttachment({
        filename: 'data.xls',
        contentType: 'application/vnd.ms-excel',
      });
      const result = await parser.parse(attachment);
      expect(result.filename).toBe('data.xls');
    });

    it('routes msword to OfficeParser', async () => {
      const attachment = makeAttachment({
        filename: 'doc.doc',
        contentType: 'application/msword',
      });
      const result = await parser.parse(attachment);
      expect(result.filename).toBe('doc.doc');
    });
  });

  describe('toText', () => {
    it('returns text from parsed attachment', async () => {
      const attachment = makeAttachment({
        filename: 'notes.txt',
        contentType: 'text/plain',
        content: Buffer.from('My notes'),
      });
      const text = await parser.toText(attachment);
      expect(text).toBe('My notes');
    });

    it('returns fallback when no text extracted', async () => {
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0xFD, 0xFC, 0xFB, 0xFA]);
      const attachment = makeAttachment({
        filename: 'data.bin',
        contentType: 'application/octet-stream',
        content: binaryContent,
      });
      const text = await parser.toText(attachment);
      expect(text).toBeTruthy();
    });
  });

  describe('describe', () => {
    it('throws when adapter has no vision', async () => {
      const mockAdapter = createMockLLMAdapter();
      delete (mockAdapter as any).vision;
      const attachment = makeAttachment({ contentType: 'image/jpeg' });
      await expect(parser.describe(attachment, mockAdapter)).rejects.toThrow(
        AdapterNotConfiguredError,
      );
    });

    it('describes images using ImageParser', async () => {
      const mockAdapter = createMockLLMAdapter({ visionResponse: 'A cat' });
      const attachment = makeAttachment({ contentType: 'image/jpeg' });
      const desc = await parser.describe(attachment, mockAdapter);
      expect(desc).toBe('A photo of a cat');
    });

    it('describes text-based attachments using LLM', async () => {
      const mockAdapter = createMockLLMAdapter({
        completeResponse: 'A document about testing.',
      });
      (mockAdapter as any).vision = vi.fn();
      const attachment = makeAttachment({
        contentType: 'text/plain',
        content: Buffer.from('Testing document content'),
      });
      const desc = await parser.describe(attachment, mockAdapter);
      expect(desc).toBe('A document about testing.');
    });
  });

  describe('ocr', () => {
    it('performs OCR on images', async () => {
      const attachment = makeAttachment({ contentType: 'image/png' });
      const text = await parser.ocr(attachment);
      expect(text).toBe('OCR extracted text');
    });

    it('extracts text from PDFs', async () => {
      const attachment = makeAttachment({ contentType: 'application/pdf' });
      const text = await parser.ocr(attachment);
      expect(text).toBe('PDF text content');
    });

    it('throws for unsupported content types', async () => {
      const attachment = makeAttachment({ contentType: 'application/zip' });
      await expect(parser.ocr(attachment)).rejects.toThrow(EmaiError);
      await expect(parser.ocr(attachment)).rejects.toThrow('not supported');
    });
  });

  describe('createAttachmentParser', () => {
    it('creates an AttachmentParser instance', () => {
      const p = createAttachmentParser();
      expect(p).toBeInstanceOf(AttachmentParser);
    });
  });
});
