import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli/**',
        'src/mcp/**',
        'src/providers/gmail.ts',
        'src/providers/outlook.ts',
        'src/providers/imap-smtp.ts',
        'src/search/stores/pinecone.ts',
        'src/search/stores/weaviate.ts',
        'src/search/stores/chromadb.ts',
        'src/search/stores/pgvector.ts',
        'src/search/stores/sqlite.ts',
        'src/storage/sqlite.ts',
        'src/attachments/pdf.ts',
        'src/attachments/image.ts',
        'src/attachments/office.ts',
        'src/attachments/csv.ts',
        'src/attachments/video.ts',
      ],
      reporter: ['text', 'text-summary'],
    },
    testTimeout: 10_000,
  },
});
