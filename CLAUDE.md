# CLAUDE.md

MCP server exposing CalDAV calendar operations as tools for AI assistants.

## Stack
- TypeScript, ESM (`"type": "module"`), Node ≥18, compiled with `tsc` to `dist/`.
- Biome for lint + format (`npm run check` / `check:fix`) — do not add ESLint or Prettier.
- Vitest for tests, lefthook for git hooks, semantic-release for publishing.
- Runtime deps: `@modelcontextprotocol/sdk`, `ts-caldav`, `zod`.

## Layout
- `src/index.ts` — server entry; wires up `StdioServerTransport` and registers tools.
- `src/tools/<tool>.ts` — one file per MCP tool, with `*.test.ts` next to it.
- Credentials come from `.env` (see `.env.example`); dev loads it via `tsx --env-file=.env`, not `dotenv`.

## Workflow
- Dev: `npm run dev` (watch). Build: `npm run build`. Test: `npm test`.
- Before pushing: `npm run validate` (check + test + build).
- Conventional Commits enforced by commitlint; versions and `CHANGELOG.md` are owned by semantic-release — do not bump `version` or edit the changelog by hand.
