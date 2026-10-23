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
- `smoke` writes real data to the first calendar `list-calendars` returns: two events 1h from now (one addressed by absolute URL, one by server-relative path), a daily ×3 recurring event 2h from now, a whole-day event on 2030-08-18, and a yearly whole-day event 3 days from now (ending four years on). If a calendar supports VTODO, it also creates, completes, updates, and deletes a todo on the first such calendar. Everything is deleted on success.
- `smoke` cleans up on failure only for the relative-path event and the two whole-day events (`try/finally`). Any other failure, or a killed run, can leave events or the todo behind; their summaries start with `caldav-mcp smoke`.
- `smoke:agent` runs a full `claude -p` session: costs LLM tokens on your Claude account, uses your default model, and is slower than `smoke`. The model creates, renames, lists, and deletes a test event 1h from now on the first calendar, then calls `list-events` with an invalid date. Cleanup depends on the model following the prompt; the script itself deletes nothing, so an aborted run can leave an event with a model-chosen title.
- Skip both for docs-only, test-only, or CI/tooling changes that don't touch `src/`. For other `src/` changes, `smoke` is usually enough; run `smoke:agent` too when tool names, descriptions, schemas, or error messages change.

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `npx ultracite fix`
- **Check for issues**: `npx ultracite check`
- **Diagnose setup**: `npx ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns
- Avoid import cycles; move shared code into a module both sides import

### Security

- Add `rel="noopener noreferrer"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**
- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**
- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**
- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome will catch most mechanical issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `npx ultracite fix` before committing to ensure compliance.
