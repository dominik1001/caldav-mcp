# caldav-mcp

MCP server exposing CalDAV calendar operations as tools for AI assistants.

## Conventions
- Biome for lint + format (`npm run check` / `check:fix`) — do not add ESLint or Prettier.
- Credentials come from `.env` (see `.env.example`); dev loads it via `tsx --env-file=.env`, not `dotenv`.
- Avoid import cycles; move shared code into a module both sides import.

## Workflow
- After implementing a new feature run the smoke tests (`npm run smoke` and `npm run smoke:agent`) to verify it works as expected.
- Skip both for docs-only, test-only, or CI/tooling changes that don't touch `src/`. For other `src/` changes, `smoke` is usually enough; run `npm run smoke:http` too when `src/index.ts` or `src/http-*.ts` change, and `smoke:agent` when tool names, descriptions, schemas, or error messages change.
- Both write real data to the calendar account in `.env`, and `smoke:agent` costs LLM tokens. Load the `smoke-tests` skill before running them: it lists what they create and how to find leftovers (summaries start with `caldav-mcp smoke`).

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
