import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const CONFIG_PATH = join(process.cwd(), '.emai-playground.json');

const AuthSchema = z.union([
  z.object({ user: z.string(), pass: z.string() }),
  z.object({ user: z.string(), accessToken: z.string() }),
]);

export const PlaygroundConfigSchema = z.object({
  provider: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('gmail'),
      credentials: z.object({
        clientId: z.string(),
        clientSecret: z.string(),
        refreshToken: z.string(),
        accessToken: z.string().optional(),
      }),
    }),
    z.object({
      type: z.literal('outlook'),
      credentials: z.object({
        clientId: z.string(),
        clientSecret: z.string(),
        tenantId: z.string().optional(),
        refreshToken: z.string(),
        accessToken: z.string().optional(),
      }),
    }),
    z.object({
      type: z.literal('imap'),
      imap: z.object({
        host: z.string(),
        port: z.number(),
        secure: z.boolean().optional(),
        auth: AuthSchema,
      }),
      smtp: z.object({
        host: z.string(),
        port: z.number(),
        secure: z.boolean().optional(),
        auth: AuthSchema,
      }),
    }),
  ]),
  ai: z
    .object({
      adapter: z.enum(['openai', 'anthropic', 'google', 'ollama']),
      apiKey: z.string().optional(),
      model: z.string().optional(),
      embeddingModel: z.string().optional(),
      baseUrl: z.string().optional(),
      temperature: z.number().optional(),
      maxTokens: z.number().optional(),
    })
    .optional(),
  search: z
    .object({
      store: z.enum(['memory', 'sqlite', 'pgvector', 'pinecone', 'weaviate', 'chromadb']),
      path: z.string().optional(),
      connectionString: z.string().optional(),
      apiKey: z.string().optional(),
      environment: z.string().optional(),
      url: z.string().optional(),
      indexName: z.string().optional(),
      collectionName: z.string().optional(),
      dimensions: z.number().optional(),
    })
    .optional(),
  storage: z
    .object({
      type: z.enum(['memory', 'sqlite']),
      path: z.string().optional(),
    })
    .optional(),
  safety: z
    .object({
      piiScanning: z.boolean().optional(),
      credentialScanning: z.boolean().optional(),
      humanApproval: z.enum(['all', 'high-risk', 'none']).optional(),
      maxRecipientsPerEmail: z.number().optional(),
    })
    .optional(),
});

export type PlaygroundConfig = z.infer<typeof PlaygroundConfigSchema>;

export function readConfig(): PlaygroundConfig | null {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return PlaygroundConfigSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeConfig(config: PlaygroundConfig): void {
  PlaygroundConfigSchema.parse(config);
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
