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
I want to put a 30-minute placeholder on my calendar about an hour from
now — just a clearly marked test event so I can confirm my calendar
sync is working end-to-end. Use whichever of my calendars comes up
first. After it's on there, change the title so I can tell it actually
updated, then look at the calendar again to confirm the new title is
showing, and finally remove it so it doesn't clutter my schedule. If
something goes sideways partway through, please still try to clean up
the placeholder before you stop.

One last thing: as a sanity check, deliberately ask for events using
a nonsense date like "not-a-date" and tell me whether the server
responded with a clean error or blew up.

Report back as JSON matching the provided schema, one entry per
calendar tool you exercised. Set ok=false for any tool that errored
unexpectedly and include the raw error string.
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
