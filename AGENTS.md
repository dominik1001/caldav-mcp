# caldav-mcp

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

## Smoke tests
Two complementary end-to-end checks against a real CalDAV server (uses `.env`):
- `npm run smoke` — deterministic SDK harness (`scripts/smoke.ts`). Spawns the built server over stdio via the MCP client SDK and asserts the create → list → update → delete round-trip. Fast, no LLM cost; safe to run in CI on every PR.
- `npm run smoke:agent` — agent-ergonomics harness (`scripts/smoke-agent.sh`). Drives the server via `claude -p` with a JSON output schema, validating that tool names, descriptions, schemas, and error messages are usable by an LLM. Costs API tokens and is non-deterministic; run on demand when changing tool surfaces, not per-PR.

`.mcp.json` at the repo root registers the server (loads `.env` via `node --env-file`) so both the agent smoke and interactive Claude Code sessions pick it up automatically.
