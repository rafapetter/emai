# emai — Agent Instructions

## Overview

AI-first email toolkit for agents. Monolithic TypeScript package. Status: v0.1.0, built but not tested.

## Commands

```bash
npm run build       # Build (tsup → ESM + CJS + DTS)
npm run typecheck   # TypeScript strict check
npm run dev         # Watch mode
```

## Structure

- `src/index.ts` — Main `Emai` class (facade)
- `src/core/` — Types, config, errors, utils
- `src/providers/` — Gmail, Outlook, IMAP/SMTP (unified `EmailProvider` interface)
- `src/ai/` — LLM adapters + classify/extract/compose/summarize/priority/actions engines
- `src/search/` — Semantic/full-text/hybrid search + 6 vector store backends
- `src/attachments/` — PDF/image/Office/CSV/video parsers with OCR and vision
- `src/threading/` — Conversation thread detection
- `src/safety/` — PII/credential scanning + human-in-the-loop approval
- `src/events/` — Event emitter + IMAP IDLE watcher + webhooks
- `src/mcp/` — 37-tool MCP server
- `src/cli/` — 20-command CLI

## Conventions

- TypeScript strict. No `any`. Zod for validation.
- Optional deps via `tryImport()` from `src/core/utils.ts`.
- Files: kebab-case. Classes: PascalCase. Functions: camelCase.
- Only required dep: `zod`. Everything else is optional peer.
