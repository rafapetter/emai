import type { ParsedAttachment, AttachmentParseOptions } from '../core/types.js';
import { tryImport } from '../core/utils.js';
import { EmaiError } from '../core/errors.js';

interface PdfParseResult {
  text: string;
  numpages: number;
  numrender: number;
  info: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  version: string;
}

type PdfParseFn = (dataBuffer: Buffer) => Promise<PdfParseResult>;

export class PdfParser {
  async parse(
    content: Buffer,
    options: AttachmentParseOptions = {},
  ): Promise<ParsedAttachment> {
    const depth = options.depth ?? 'medium';
    const pdfParse = await this.loadPdfParse();

    let result: PdfParseResult;
    try {
      result = await pdfParse(Buffer.from(content));
    } catch (err) {
      throw new EmaiError(
        `Failed to parse PDF: ${err instanceof Error ? err.message : String(err)}`,
        'PARSE_ERROR',
        err,
      );
    }

    const text = this.cleanText(result.text);
    const metadata: Record<string, unknown> = {
      pages: result.numpages,
      pdfVersion: result.version,
    };

    if (result.info) {
      const info = result.info;
      if (info['Title']) metadata['title'] = info['Title'];
      if (info['Author']) metadata['author'] = info['Author'];
      if (info['Subject']) metadata['subject'] = info['Subject'];
      if (info['Creator']) metadata['creator'] = info['Creator'];
      if (info['Producer']) metadata['producer'] = info['Producer'];
      if (info['CreationDate']) metadata['creationDate'] = info['CreationDate'];
      if (info['ModDate']) metadata['modDate'] = info['ModDate'];
    }

    const parsed: ParsedAttachment = {
      filename: '',
      contentType: 'application/pdf',
      size: content.length,
      text,
      metadata,
      pages: result.numpages,
    };

    if (depth === 'basic') {
      parsed.text = text.length > 500 ? text.slice(0, 500) + '...' : text;
    }

    if (depth === 'medium' || depth === 'deep') {
      parsed.markdown = this.textToMarkdown(text, result.numpages);
    }

    if (depth === 'deep' && options.extractTables !== false) {
      parsed.tables = this.extractTablesFromText(text);
    }

    return parsed;
  }

  private async loadPdfParse(): Promise<PdfParseFn> {
    const mod = await tryImport<{ default: PdfParseFn }>('pdf-parse', 'PDF parsing');
    return mod.default;
  }

  private cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim();
  }

  private textToMarkdown(text: string, pages: number): string {
    const lines: string[] = [`# PDF Document (${pages} page${pages === 1 ? '' : 's'})`, ''];
    const paragraphs = text.split(/\n{2,}/);

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;
      lines.push(trimmed, '');
    }

    return lines.join('\n').trim();
  }

  private extractTablesFromText(text: string) {
    const tables: Array<{ headers: string[]; rows: string[][] }> = [];
    const lines = text.split('\n');
    let tableRows: string[][] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (tableRows.length >= 2) {
          const maxCols = Math.max(...tableRows.map((r) => r.length));
          if (maxCols >= 2) {
            const normalized = tableRows.map((r) => {
              while (r.length < maxCols) r.push('');
              return r;
            });
            tables.push({
              headers: normalized[0],
              rows: normalized.slice(1),
            });
          }
        }
        tableRows = [];
        continue;
      }

      const cells = trimmed.split(/\t+|  {2,}|\s{2,}\|\s{2,}/);
      if (cells.length >= 2) {
        tableRows.push(cells.map((c) => c.trim()));
      } else {
        if (tableRows.length >= 2) {
          const maxCols = Math.max(...tableRows.map((r) => r.length));
          if (maxCols >= 2) {
            const normalized = tableRows.map((r) => {
              while (r.length < maxCols) r.push('');
              return r;
            });
            tables.push({
              headers: normalized[0],
              rows: normalized.slice(1),
            });
          }
        }
        tableRows = [];
      }
    }

    if (tableRows.length >= 2) {
      const maxCols = Math.max(...tableRows.map((r) => r.length));
      if (maxCols >= 2) {
        const normalized = tableRows.map((r) => {
          while (r.length < maxCols) r.push('');
          return r;
        });
        tables.push({
          headers: normalized[0],
          rows: normalized.slice(1),
        });
      }
    }

    return tables;
  }
}
