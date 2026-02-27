import type { ParsedAttachment, ParsedTable, AttachmentParseOptions } from '../core/types.js';
import { EmaiError } from '../core/errors.js';

interface PapaParseResult {
  data: string[][];
  errors: Array<{ message: string; row?: number }>;
  meta: {
    delimiter: string;
    linebreak: string;
    aborted: boolean;
    truncated: boolean;
    fields?: string[];
  };
}

interface PapaParseModule {
  parse(input: string, config?: Record<string, unknown>): PapaParseResult;
}

export class CsvParser {
  async parse(
    content: Buffer,
    options: AttachmentParseOptions = {},
  ): Promise<ParsedAttachment> {
    const depth = options.depth ?? 'medium';
    const text = content.toString('utf-8');

    let table: ParsedTable;
    let delimiter = ',';

    try {
      const result = await this.parseWithPapa(text);
      table = this.resultToTable(result);
      delimiter = result.meta.delimiter;
    } catch {
      table = this.fallbackParse(text);
    }

    const parsed: ParsedAttachment = {
      filename: '',
      contentType: 'text/csv',
      size: content.length,
      text: this.tableToText(table),
      tables: [table],
      metadata: {
        format: 'csv',
        delimiter,
        rowCount: table.rows.length,
        columnCount: table.headers.length,
      },
    };

    if (depth !== 'basic') {
      parsed.markdown = this.tableToMarkdown(table);
    }

    return parsed;
  }

  private async parseWithPapa(text: string): Promise<PapaParseResult> {
    let papa: PapaParseModule;
    try {
      papa = (await import(/* webpackIgnore: true */ 'papaparse' as string)) as unknown as PapaParseModule;
      if ('default' in papa && typeof (papa as Record<string, unknown>)['default'] === 'object') {
        papa = (papa as unknown as { default: PapaParseModule }).default;
      }
    } catch {
      throw new Error('papaparse not available');
    }

    const result = papa.parse(text, {
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    if (result.errors.length > 0 && result.data.length === 0) {
      throw new EmaiError(
        `CSV parse errors: ${result.errors.map((e) => e.message).join('; ')}`,
        'PARSE_ERROR',
      );
    }

    return result;
  }

  private resultToTable(result: PapaParseResult): ParsedTable {
    const data = result.data.filter((row) => row.some((cell) => cell.trim() !== ''));
    if (data.length === 0) {
      return { headers: [], rows: [] };
    }

    const maxCols = Math.max(...data.map((r) => r.length));
    const normalized = data.map((row) => {
      const padded = [...row];
      while (padded.length < maxCols) padded.push('');
      return padded;
    });

    return {
      headers: normalized[0],
      rows: normalized.slice(1),
    };
  }

  private fallbackParse(text: string): ParsedTable {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }

    const delimiter = this.detectDelimiter(lines[0]);
    const data = lines.map((line) => this.splitRow(line, delimiter));
    const maxCols = Math.max(...data.map((r) => r.length));
    const normalized = data.map((row) => {
      while (row.length < maxCols) row.push('');
      return row;
    });

    return {
      headers: normalized[0],
      rows: normalized.slice(1),
    };
  }

  private detectDelimiter(line: string): string {
    const candidates = [',', '\t', ';', '|'];
    let best = ',';
    let bestCount = 0;

    for (const d of candidates) {
      const count = line.split(d).length - 1;
      if (count > bestCount) {
        bestCount = count;
        best = d;
      }
    }

    return best;
  }

  private splitRow(line: string, delimiter: string): string[] {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }

    cells.push(current.trim());
    return cells;
  }

  private tableToText(table: ParsedTable): string {
    const lines: string[] = [];
    if (table.headers.length > 0) lines.push(table.headers.join('\t'));
    for (const row of table.rows) {
      lines.push(row.join('\t'));
    }
    return lines.join('\n');
  }

  private tableToMarkdown(table: ParsedTable): string {
    if (table.headers.length === 0) return '';

    const lines: string[] = [];
    lines.push('| ' + table.headers.join(' | ') + ' |');
    lines.push('| ' + table.headers.map(() => '---').join(' | ') + ' |');
    for (const row of table.rows) {
      lines.push('| ' + row.join(' | ') + ' |');
    }
    return lines.join('\n');
  }
}
