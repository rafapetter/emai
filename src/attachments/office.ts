import type { ParsedAttachment, ParsedTable, AttachmentParseOptions } from '../core/types.js';
import { tryImport } from '../core/utils.js';
import { EmaiError } from '../core/errors.js';

interface MammothResult {
  value: string;
  messages: Array<{ type: string; message: string }>;
}

interface MammothModule {
  convertToHtml(options: { buffer: Buffer }): Promise<MammothResult>;
  extractRawText(options: { buffer: Buffer }): Promise<MammothResult>;
}

interface JSZipFile {
  async(type: 'string'): Promise<string>;
}

interface JSZipInstance {
  files: Record<string, JSZipFile>;
  file(name: RegExp): Array<JSZipFile & { name: string }>;
  loadAsync(data: Buffer): Promise<JSZipInstance>;
}

interface JSZipConstructor {
  new (): JSZipInstance;
  loadAsync(data: Buffer): Promise<JSZipInstance>;
}

export class OfficeParser {
  async parse(
    content: Buffer,
    contentType: string,
    options: AttachmentParseOptions = {},
  ): Promise<ParsedAttachment> {
    const depth = options.depth ?? 'medium';

    if (this.isDocx(contentType)) {
      return this.parseDocx(content, depth);
    }
    if (this.isXlsx(contentType)) {
      return this.parseXlsx(content, depth);
    }
    if (this.isPptx(contentType)) {
      return this.parsePptx(content, depth);
    }

    return this.parseGenericOffice(content, contentType, depth);
  }

  private isDocx(ct: string): boolean {
    return (
      ct === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ct === 'application/msword'
    );
  }

  private isXlsx(ct: string): boolean {
    return (
      ct === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      ct === 'application/vnd.ms-excel'
    );
  }

  private isPptx(ct: string): boolean {
    return (
      ct === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      ct === 'application/vnd.ms-powerpoint'
    );
  }

  private async parseDocx(
    content: Buffer,
    depth: string,
  ): Promise<ParsedAttachment> {
    const mammoth = await tryImport<MammothModule>('mammoth', 'DOCX parsing');

    try {
      const [htmlResult, textResult] = await Promise.all([
        mammoth.convertToHtml({ buffer: content }),
        mammoth.extractRawText({ buffer: content }),
      ]);

      const parsed: ParsedAttachment = {
        filename: '',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: content.length,
        text: textResult.value,
        metadata: {
          format: 'docx',
          conversionMessages: htmlResult.messages.length,
        },
      };

      if (depth !== 'basic') {
        parsed.markdown = this.htmlToSimpleMarkdown(htmlResult.value);
      }

      return parsed;
    } catch (err) {
      throw new EmaiError(
        `DOCX parse failed: ${err instanceof Error ? err.message : String(err)}`,
        'PARSE_ERROR',
        err,
      );
    }
  }

  private async parseXlsx(
    content: Buffer,
    depth: string,
  ): Promise<ParsedAttachment> {
    const zip = await this.loadZip(content);
    const tables: ParsedTable[] = [];
    const sheetFiles = this.getZipEntries(zip, /^xl\/worksheets\/sheet\d+\.xml$/);

    let sharedStrings: string[] = [];
    try {
      const ssFile = zip.files['xl/sharedStrings.xml'];
      if (ssFile) {
        const ssXml = await ssFile.async('string');
        sharedStrings = this.parseSharedStrings(ssXml);
      }
    } catch {
      // No shared strings — values are inline
    }

    let sheetNames: string[] = [];
    try {
      const wbFile = zip.files['xl/workbook.xml'];
      if (wbFile) {
        const wbXml = await wbFile.async('string');
        sheetNames = this.parseSheetNames(wbXml);
      }
    } catch {
      // Fall back to numbered sheet names
    }

    for (let i = 0; i < sheetFiles.length; i++) {
      const xmlContent = await sheetFiles[i].async('string');
      const table = this.parseSheetXml(xmlContent, sharedStrings);
      if (table.headers.length > 0 || table.rows.length > 0) {
        table.sheetName = sheetNames[i] ?? `Sheet ${i + 1}`;
        tables.push(table);
      }
    }

    const textParts: string[] = [];
    for (const table of tables) {
      if (table.sheetName) textParts.push(`--- ${table.sheetName} ---`);
      if (table.headers.length > 0) textParts.push(table.headers.join('\t'));
      for (const row of table.rows) {
        textParts.push(row.join('\t'));
      }
      textParts.push('');
    }

    const parsed: ParsedAttachment = {
      filename: '',
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: content.length,
      text: textParts.join('\n').trim(),
      tables,
      metadata: {
        format: 'xlsx',
        sheetCount: tables.length,
      },
    };

    if (depth !== 'basic') {
      parsed.markdown = this.tablesToMarkdown(tables);
    }

    return parsed;
  }

  private async parsePptx(
    content: Buffer,
    depth: string,
  ): Promise<ParsedAttachment> {
    const zip = await this.loadZip(content);
    const slideFiles = this.getZipEntries(zip, /^ppt\/slides\/slide\d+\.xml$/);
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.name.match(/slide(\d+)/)?.[1] ?? '0', 10);
      const numB = parseInt(b.name.match(/slide(\d+)/)?.[1] ?? '0', 10);
      return numA - numB;
    });

    const slides: string[] = [];
    for (const file of slideFiles) {
      const xml = await file.async('string');
      const text = this.extractTextFromXml(xml);
      if (text.trim()) {
        slides.push(text.trim());
      }
    }

    const fullText = slides
      .map((s, i) => `Slide ${i + 1}:\n${s}`)
      .join('\n\n');

    const parsed: ParsedAttachment = {
      filename: '',
      contentType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      size: content.length,
      text: fullText,
      metadata: {
        format: 'pptx',
        slideCount: slides.length,
      },
    };

    if (depth !== 'basic') {
      const mdLines = slides.map(
        (s, i) => `## Slide ${i + 1}\n\n${s}`,
      );
      parsed.markdown = mdLines.join('\n\n---\n\n');
    }

    return parsed;
  }

  private async parseGenericOffice(
    content: Buffer,
    contentType: string,
    _depth: string,
  ): Promise<ParsedAttachment> {
    try {
      const zip = await this.loadZip(content);
      const xmlFiles = this.getZipEntries(zip, /\.xml$/);
      const textParts: string[] = [];

      for (const file of xmlFiles.slice(0, 20)) {
        try {
          const xml = await file.async('string');
          const text = this.extractTextFromXml(xml);
          if (text.trim()) textParts.push(text.trim());
        } catch {
          continue;
        }
      }

      return {
        filename: '',
        contentType,
        size: content.length,
        text: textParts.join('\n\n').trim() || '[No extractable text content]',
        metadata: { format: 'office-generic', xmlFilesProcessed: xmlFiles.length },
      };
    } catch {
      return {
        filename: '',
        contentType,
        size: content.length,
        text: '[Unable to extract text from this Office format]',
        metadata: { format: 'office-unknown' },
      };
    }
  }

  private async loadZip(content: Buffer): Promise<JSZipInstance> {
    const JSZip = await tryImport<{ default: JSZipConstructor }>(
      'jszip',
      'Office document parsing',
    );
    return JSZip.default.loadAsync(content);
  }

  private getZipEntries(
    zip: JSZipInstance,
    pattern: RegExp,
  ): Array<JSZipFile & { name: string }> {
    return zip.file(pattern);
  }

  private extractTextFromXml(xml: string): string {
    const textParts: string[] = [];
    const tagPattern = /<(?:a:t|t)(?:\s[^>]*)?>([^<]*)<\/(?:a:t|t)>/g;
    let match: RegExpExecArray | null;
    while ((match = tagPattern.exec(xml)) !== null) {
      const text = match[1].trim();
      if (text) textParts.push(text);
    }
    return textParts.join(' ');
  }

  private parseSharedStrings(xml: string): string[] {
    const strings: string[] = [];
    const siPattern = /<si>([\s\S]*?)<\/si>/g;
    let siMatch: RegExpExecArray | null;
    while ((siMatch = siPattern.exec(xml)) !== null) {
      const inner = siMatch[1];
      const textParts: string[] = [];
      const tPattern = /<t[^>]*>([^<]*)<\/t>/g;
      let tMatch: RegExpExecArray | null;
      while ((tMatch = tPattern.exec(inner)) !== null) {
        textParts.push(tMatch[1]);
      }
      strings.push(textParts.join(''));
    }
    return strings;
  }

  private parseSheetNames(xml: string): string[] {
    const names: string[] = [];
    const pattern = /<sheet[^>]+name="([^"]*)"[^>]*\/?>/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(xml)) !== null) {
      names.push(match[1]);
    }
    return names;
  }

  private parseSheetXml(xml: string, sharedStrings: string[]): ParsedTable {
    const rows: string[][] = [];
    const rowPattern = /<row[^>]*>([\s\S]*?)<\/row>/g;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowPattern.exec(xml)) !== null) {
      const rowXml = rowMatch[1];
      const cells: string[] = [];
      const cellPattern = /<c[^>]*(?:t="([^"]*)")?[^>]*>(?:[\s\S]*?<v>([^<]*)<\/v>)?[\s\S]*?<\/c>/g;
      let cellMatch: RegExpExecArray | null;

      while ((cellMatch = cellPattern.exec(rowXml)) !== null) {
        const type = cellMatch[1];
        const value = cellMatch[2] ?? '';

        if (type === 's' && sharedStrings.length > 0) {
          const idx = parseInt(value, 10);
          cells.push(sharedStrings[idx] ?? value);
        } else {
          cells.push(value);
        }
      }

      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length === 0) {
      return { headers: [], rows: [] };
    }

    return {
      headers: rows[0],
      rows: rows.slice(1),
    };
  }

  private tablesToMarkdown(tables: ParsedTable[]): string {
    const sections: string[] = [];
    for (const table of tables) {
      const lines: string[] = [];
      if (table.sheetName) lines.push(`## ${table.sheetName}`, '');
      if (table.headers.length > 0) {
        lines.push('| ' + table.headers.join(' | ') + ' |');
        lines.push('| ' + table.headers.map(() => '---').join(' | ') + ' |');
      }
      for (const row of table.rows) {
        lines.push('| ' + row.join(' | ') + ' |');
      }
      sections.push(lines.join('\n'));
    }
    return sections.join('\n\n');
  }

  private htmlToSimpleMarkdown(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<p[^>]*>/gi, '')
      .replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_m, level: string, text: string) => {
        return '#'.repeat(Number(level)) + ' ' + text.trim() + '\n\n';
      })
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
