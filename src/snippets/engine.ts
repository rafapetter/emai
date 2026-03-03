import type { StorageAdapter } from '../core/types.js';
import { generateId } from '../core/utils.js';
import { ValidationError } from '../core/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Snippet {
  id: string;
  name: string;
  subject?: string;
  text: string;
  html?: string;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSnippetOptions {
  name: string;
  subject?: string;
  text: string;
  html?: string;
}

export interface RenderedSnippet {
  subject?: string;
  text: string;
  html?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;
const STORAGE_INDEX_KEY = 'snippets:index';

function storageKey(id: string): string {
  return `snippets:${id}`;
}

/**
 * Extract unique `{{variable}}` names from one or more template strings.
 */
function extractVariables(...templates: (string | undefined)[]): string[] {
  const vars = new Set<string>();
  for (const tpl of templates) {
    if (!tpl) continue;
    for (const match of tpl.matchAll(VARIABLE_REGEX)) {
      vars.add(match[1]);
    }
  }
  return [...vars];
}

/**
 * Replace `{{variable}}` placeholders with the corresponding value.
 * Unknown variables are left as-is.
 */
function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(VARIABLE_REGEX, (original, key: string) => {
    return Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]
      : original;
  });
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class SnippetEngine {
  constructor(private readonly storage: StorageAdapter) {}

  // ---- Index helpers ------------------------------------------------------

  private async getIndex(): Promise<string[]> {
    const raw = await this.storage.getMetadata(STORAGE_INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  }

  private async setIndex(ids: string[]): Promise<void> {
    await this.storage.setMetadata(STORAGE_INDEX_KEY, JSON.stringify(ids));
  }

  // ---- CRUD ---------------------------------------------------------------

  async create(options: CreateSnippetOptions): Promise<Snippet> {
    if (!options.name || !options.text) {
      throw new ValidationError('Snippet name and text are required');
    }

    const existing = await this.getByName(options.name);
    if (existing) {
      throw new ValidationError(
        `Snippet with name "${options.name}" already exists`,
      );
    }

    const now = new Date().toISOString();
    const snippet: Snippet = {
      id: generateId(),
      name: options.name,
      subject: options.subject,
      text: options.text,
      html: options.html,
      variables: extractVariables(options.text, options.html, options.subject),
      createdAt: now,
      updatedAt: now,
    };

    await this.storage.setMetadata(storageKey(snippet.id), JSON.stringify(snippet));

    const index = await this.getIndex();
    index.push(snippet.id);
    await this.setIndex(index);

    return snippet;
  }

  async get(id: string): Promise<Snippet | null> {
    const raw = await this.storage.getMetadata(storageKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as Snippet;
  }

  async getByName(name: string): Promise<Snippet | null> {
    const all = await this.list();
    return all.find((s) => s.name === name) ?? null;
  }

  async list(): Promise<Snippet[]> {
    const index = await this.getIndex();
    const snippets: Snippet[] = [];

    for (const id of index) {
      const snippet = await this.get(id);
      if (snippet) snippets.push(snippet);
    }

    return snippets;
  }

  async update(id: string, options: Partial<CreateSnippetOptions>): Promise<Snippet> {
    const existing = await this.get(id);
    if (!existing) {
      throw new ValidationError(`Snippet not found: ${id}`);
    }

    // If the name is being changed, check for collisions
    if (options.name && options.name !== existing.name) {
      const collision = await this.getByName(options.name);
      if (collision) {
        throw new ValidationError(
          `Snippet with name "${options.name}" already exists`,
        );
      }
    }

    const updated: Snippet = {
      ...existing,
      name: options.name ?? existing.name,
      subject: options.subject !== undefined ? options.subject : existing.subject,
      text: options.text ?? existing.text,
      html: options.html !== undefined ? options.html : existing.html,
      updatedAt: new Date().toISOString(),
    };

    // Re-derive variables from the (possibly updated) content
    updated.variables = extractVariables(updated.text, updated.html, updated.subject);

    await this.storage.setMetadata(storageKey(id), JSON.stringify(updated));

    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing) {
      throw new ValidationError(`Snippet not found: ${id}`);
    }

    // Remove from storage
    await this.storage.setMetadata(storageKey(id), '');

    // Remove from index
    const index = await this.getIndex();
    const filtered = index.filter((i) => i !== id);
    await this.setIndex(filtered);
  }

  // ---- Rendering ----------------------------------------------------------

  async render(
    nameOrId: string,
    variables: Record<string, string> = {},
  ): Promise<RenderedSnippet> {
    // Try lookup by ID first, then by name
    let snippet = await this.get(nameOrId);
    if (!snippet) {
      snippet = await this.getByName(nameOrId);
    }
    if (!snippet) {
      throw new ValidationError(`Snippet not found: ${nameOrId}`);
    }

    return {
      subject: snippet.subject
        ? interpolate(snippet.subject, variables)
        : undefined,
      text: interpolate(snippet.text, variables),
      html: snippet.html ? interpolate(snippet.html, variables) : undefined,
    };
  }
}
