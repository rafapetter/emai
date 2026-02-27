# emai — Agent Context

## What This Is

**emai** is an open-source, AI-first, monolithic TypeScript email toolkit for AI agents. It unifies reading, sending, searching, classifying, extracting, and managing email across Gmail, Outlook, and IMAP/SMTP into a single package.

## Current Status: v0.1.0 — Built & Tested

All 4 implementation phases are complete (58 files, ~14,600 lines, builds clean with zero type errors). 537 unit tests across 27 test files, ~76% statement coverage. Ready for publishing.

## Project Structure

```
emai/
├── src/index.ts              Main Emai class (facade pattern)
├── src/core/                  Types, config, errors, utils
├── src/providers/             Gmail, Outlook, IMAP/SMTP providers
├── src/ai/                    LLM adapters (OpenAI/Anthropic/Google/Ollama) + 6 AI engines
├── src/search/                Semantic + full-text + hybrid search, 6 vector store backends
├── src/attachments/           PDF, image (OCR+vision), Office, CSV, video parsers
├── src/threading/             Thread detection (header + subject + participant strategies)
├── src/safety/                PII/credential scanning, policies, human-in-the-loop
├── src/events/                Event emitter, IMAP IDLE watcher, webhooks
├── src/storage/               Memory + SQLite persistence
├── src/mcp/                   37-tool MCP server
├── src/cli/                   20-command CLI
├── bin/emai.js                CLI entry
├── package.json               Only required dep: zod. All others optional/peer.
└── README.md                  Full documentation
```

## Commands

```bash
npm run build          # Build with tsup (ESM + CJS + DTS)
npm run typecheck      # TypeScript strict check (npx tsc --noEmit)
npm run dev            # Watch mode build
npm run test           # Run all 537 tests
npm run test:watch     # Watch mode tests
npm run test:coverage  # Tests + coverage report
```

## Key Decisions

- **Monolithic package** — single `npm install emai`, not a monorepo
- **AI deeply woven** — every operation is AI-aware by design
- **Provider-agnostic LLM** — user brings their own (adapters for 4 providers)
- **Pluggable storage** — memory default, SQLite/pgvector/Pinecone/Weaviate/ChromaDB options
- **MIT license** — maximum permissiveness
- **Zero required deps** besides zod — everything else is optional peer

## What Needs Doing Next

1. **npm publish** — Publish to npm as `emai`
2. **Examples** — Usage examples for common scenarios
3. **Validation** — End-to-end testing with real email providers, AI adapters, and search stores
4. **Edge cases** — Error recovery, rate limiting, reconnection logic

## Conventions

- TypeScript strict, no `any` (except CLI commander setup)
- Zod at all validation boundaries
- Dynamic imports via `tryImport()` for optional dependencies
- Error types from `src/core/errors.ts`
- Files: kebab-case. Classes: PascalCase. Functions: camelCase.

## Full Spec

See `knowledge-base/3-descriptions/open-source/emai.md` for complete architecture, competitive landscape, and API surface.
