# caldav-mcp

MCP server exposing CalDAV calendar operations as tools for AI assistants.

## Tech Stack
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
- After implementing a new feature run the smoke tests (`npm run smoke` and `npm run smoke:agent`) to verify it works as expected. See "Smoke tests" for what they cost and when to skip them.

## Working with the user
- When the user asks a question, answer it before editing files or running implementation commands.
- When responding to feedback or a review, say whether you agree or disagree before saying what you changed.
- Explain non-trivial designs or bugs as problem → concrete example or short trace → solution, and say why any added complexity is needed.

## Dependencies
- Treat `package.json` and `package-lock.json` changes as reviewed code; say why a dep is added or bumped.
- `.npmrc` pins new deps to exact versions (`save-exact`) and ignores versions published less than 2 days ago (`min-release-age`). Don't rewrite existing `^` ranges.
- `min-release-age` only applies when npm resolves a version (`npm install <pkg>`, `npm update`). `npm ci` installs the lockfile as is.
- Ask before adding a dep that has lifecycle scripts (`preinstall`, `install`, `postinstall`).
- Install locally with scripts on: `prepare` runs `lefthook install`, so `--ignore-scripts` skips the git hooks. `npm ci --ignore-scripts` fits CI jobs that only need `node_modules`.

## Smoke tests
Two complementary end-to-end checks against a real CalDAV server (uses `.env`):
- `npm run smoke` — deterministic SDK harness (`scripts/smoke.ts`). Spawns the built server over stdio via the MCP client SDK and asserts the create → list → update → delete round-trip. Fast, no LLM cost. CI runs it on every PR and push to `main` against a throwaway Radicale server (`smoke` job in `release.yml`).
- `npm run smoke:agent` — agent-ergonomics harness (`scripts/smoke-agent.sh`). Drives the server via `claude -p` with a JSON output schema, validating that tool names, descriptions, schemas, and error messages are usable by an LLM.

`.mcp.json` at the repo root registers the server (loads `.env` via `node --env-file`) so both the agent smoke and interactive Claude Code sessions pick it up automatically.

Cost and side effects (locally, `.env` points at a real account):
- Needs: `.env` with `CALDAV_BASE_URL`, `CALDAV_USERNAME`, `CALDAV_PASSWORD`. `smoke:agent` also needs `claude` and `jq` on PATH. Both scripts run `npm run build` first.
- `smoke` writes real data to the first calendar `list-calendars` returns: an event 1h from now, a daily ×3 recurring event 2h from now, and a whole-day event on 2030-08-18. If a calendar supports VTODO, it also creates, completes, updates, and deletes a todo on the first such calendar. Everything is deleted on success.
- `smoke` cleans up on failure only for the 2030-08-18 event (`try/finally`). Any other failure, or a killed run, can leave events or the todo behind; their summaries start with `caldav-mcp smoke`.
- `smoke:agent` runs a full `claude -p` session: costs LLM tokens on your Claude account, uses your default model, and is slower than `smoke`. The model creates, renames, lists, and deletes a test event 1h from now on the first calendar, then calls `list-events` with an invalid date. Cleanup depends on the model following the prompt; the script itself deletes nothing, so an aborted run can leave an event with a model-chosen title.
- Skip both for docs-only, test-only, or CI/tooling changes that don't touch `src/`. For other `src/` changes, `smoke` is usually enough; run `smoke:agent` too when tool names, descriptions, schemas, or error messages change.
