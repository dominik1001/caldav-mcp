---
name: smoke-tests
description: Use before running `npm run smoke` or `npm run smoke:agent` in caldav-mcp - what each harness checks, what it needs, what real calendar data it writes, and how to find leftovers after a failed run.
---

# Smoke tests

Two complementary end-to-end checks against a real CalDAV server (uses `.env`):
- `npm run smoke` — deterministic SDK harness (`scripts/smoke.ts`). Spawns the built server over stdio via the MCP client SDK and asserts the create → list → update → delete round-trip. Fast, no LLM cost. CI runs it on every PR and push to `main` against a throwaway Radicale server (`smoke` job in `release.yml`).
- `npm run smoke:http` — the same harness with `SMOKE_TRANSPORT=http`: starts `dist/index.js --http` on an ephemeral port with a random `MCP_AUTH_TOKEN` and runs the same round-trip over Streamable HTTP. Writes and cleans up exactly what `smoke` does, and kills the server it started even when the run fails. CI runs it right after `smoke`.
- `npm run smoke:agent` — agent-ergonomics harness (`scripts/smoke-agent.sh`). Drives the server via `claude -p` with a JSON output schema, validating that tool names, descriptions, schemas, and error messages are usable by an LLM.

`.mcp.json` at the repo root registers the server (loads `.env` via `node --env-file`) so both the agent smoke and interactive Claude Code sessions pick it up automatically.

Cost and side effects (locally, `.env` points at a real account):
- Needs: `.env` with `CALDAV_BASE_URL`, `CALDAV_USERNAME`, `CALDAV_PASSWORD`. `smoke:agent` also needs `claude` and `jq` on PATH. Both scripts run `npm run build` first.
- `smoke` writes real data to the first calendar `list-calendars` returns: two events 1h from now (one addressed by absolute URL, one by server-relative path), a daily ×3 recurring event 2h from now, a whole-day event on 2030-08-18, and a yearly whole-day event 3 days from now (ending four years on). If a calendar supports VTODO, it also creates, completes, updates, and deletes a todo on the first such calendar. Everything is deleted on success.
- `smoke` cleans up on failure only for the relative-path event and the two whole-day events (`try/finally`). Any other failure, or a killed run, can leave events or the todo behind; their summaries start with `caldav-mcp smoke`.
- `smoke:agent` runs a full `claude -p` session: costs LLM tokens on your Claude account, uses your default model, and is slower than `smoke`. The model creates, renames, lists, and deletes a test event 1h from now on the first calendar, then calls `list-events` with an invalid date. Cleanup depends on the model following the prompt; the script itself deletes nothing, so an aborted run can leave an event with a model-chosen title.
