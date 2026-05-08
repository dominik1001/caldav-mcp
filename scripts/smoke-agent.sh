#!/usr/bin/env bash
# Agent-ergonomics smoke: drives the caldav MCP server via `claude -p` to
# verify the tool surface (names, descriptions, schemas, error messages) is
# usable by an LLM. Complements scripts/smoke.ts, which is a deterministic
# server-side smoke.
#
# Requires: `claude` CLI on PATH, .env populated with CALDAV_* vars,
# project built (`npm run build`).

set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v claude >/dev/null 2>&1; then
	echo "claude CLI not found on PATH" >&2
	exit 1
fi

if [ ! -f dist/index.js ]; then
	echo "dist/index.js missing — run 'npm run build' first" >&2
	exit 1
fi

PROMPT=$(cat <<'EOF'
You are testing the caldav MCP server. Use only its tools (mcp__caldav__*).

1. List all tools the server exposes.
2. Call list-calendars and pick the first calendar's URL.
3. Create an event ~1 hour from now lasting 30 minutes with a clearly
   marked test summary, on that calendar.
4. Call list-events spanning that window and verify your created event
   appears (match by uid).
5. Update the event's summary.
6. Delete the event and confirm a follow-up list-events no longer
   contains it.
7. As a deliberate bad-input test, call list-events with an invalid
   date string (e.g. "not-a-date") and confirm the server returns a
   structured error rather than crashing.

Always clean up: if any step after create-event fails, still attempt
to delete the event before reporting.

Return findings as JSON matching the provided schema. Set ok=false on
any tool that errored unexpectedly and include the raw error string.
EOF
)

SCHEMA='{
  "type": "object",
  "properties": {
    "tools": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {"type": "string"},
          "ok": {"type": "boolean"},
          "response_summary": {"type": "string"},
          "error": {"type": ["string", "null"]}
        },
        "required": ["name", "ok"]
      }
    },
    "bad_input_test": {
      "type": "object",
      "properties": {
        "tool": {"type": "string"},
        "graceful_error": {"type": "boolean"},
        "error_message": {"type": "string"}
      },
      "required": ["tool", "graceful_error"]
    }
  },
  "required": ["tools", "bad_input_test"]
}'

result=$(claude -p "$PROMPT" \
	--mcp-config .mcp.json \
	--allowedTools "mcp__caldav__*" \
	--output-format json \
	--json-schema "$SCHEMA")

echo "$result" | jq '.structured_output'

pass_tools=$(echo "$result" | jq -e '.structured_output.tools | all(.ok == true)' >/dev/null && echo yes || echo no)
pass_bad=$(echo "$result" | jq -e '.structured_output.bad_input_test.graceful_error == true' >/dev/null && echo yes || echo no)

if [ "$pass_tools" = "yes" ] && [ "$pass_bad" = "yes" ]; then
	echo "✅ agent smoke passed"
else
	echo "❌ agent smoke failed (tools=$pass_tools bad_input=$pass_bad)" >&2
	exit 1
fi
