---
name: review-agents-md
description: Reviews an AGENTS.md or CLAUDE.md file against best practices and reports concrete fixes. Use when the user asks to review, audit, lint, or improve an AGENTS.md / CLAUDE.md / context file, or says "review my agents file".
---

The meta-principle: a context file earns its tokens. Every line must tell the agent something it can't infer from the code, the formatter, or the linter. If a line could be deleted without the agent getting worse, delete it.

## Workflow

1. Read the target file (default: `AGENTS.md`, then `CLAUDE.md` at repo root). If both exist, review both.
2. Evaluate against each rubric below. For every issue, quote the offending lines and propose a concrete rewrite — not just a critique.
3. Report findings grouped by severity: **Cut** (delete), **Rewrite** (fix in place), **Add** (missing required content).
4. End with a one-line verdict: total lines now vs. proposed, and whether the tech stack is mentioned.

Do not auto-edit the file unless the user asks. Surface the diff first.

## Rubric

### Length & signal density
*Good*: Short and load-bearing. Every line is non-obvious and would change agent behavior if removed.
*Bad*: Long preambles, restated obvious facts ("we use TypeScript"), or generic engineering advice. Flag any file over ~200 lines as suspect and identify the lowest-signal sections to cut.

### Non-obvious content only
*Good*: Conventions, architecture choices, tooling quirks ("we use bun, not node"; "migrations run via `make db-migrate`, not the ORM CLI").
*Bad*: Anything derivable from `package.json`, `Cargo.toml`, file extensions, or a five-second skim of the repo. Cut it.

### Tech stack is mentioned
*Good*: The language/runtime/framework choices the agent would otherwise guess wrong are mentioned somewhere in the file (e.g., "Bun 1.x runtime, not Node"; "Postgres 16 + Drizzle, not Prisma"). A dedicated `## Tech Stack` section is fine but not required — a one-liner near the top works too.
*Bad*: No mention at all of the non-obvious stack choices, so the agent has to infer them from manifests. If missing, propose a short addition drafted from the repo's manifests.

### Auto-generated content
*Good*: Hand-written, curated.
*Bad*: Looks `/init`-generated — boilerplate headings, file-tree dumps, restatement of `package.json` scripts. Auto-generated context files measurably reduce success rates. Recommend deletion and replacement with a hand-written file.

### Outdated docs
*Good*: Current. References match the code.
*Bad*: Mentions removed files, renamed commands, deprecated workflows. The agent reads these anyway and gets misled. Flag specific stale references and recommend deletion from the repo, not just from the context file.

### Don't redocument the formatter / linter
*Good*: Silent on style — `prettier`, `eslint`, `rustfmt`, `ruff` enforce it.
*Bad*: "Use 2-space indent", "prefer single quotes", "no unused imports". Cut. If a rule isn't enforced by tooling, recommend adding the rule to the tooling instead of to the context file.

### Procedural workflows live elsewhere
*Good*: Recurring multi-step tasks (release, migration, deploy) live in slash commands or skills. `AGENTS.md` points to them by name.
*Bad*: Numbered step-by-step procedures embedded in `AGENTS.md` itself. Recommend extracting each procedure into `.claude/commands/<name>.md` or a skill, and replacing the section with a one-line pointer.

### Decision tables for genuine choices
*Good*: When 2–3 valid approaches exist, a small table with columns like *Situation* / *Use* / *Why*.
*Bad*: Prose that lists options without telling the agent which to pick when. Convert to a table.

### Pair every "don't" with a "do"
*Good*: "Don't add new endpoints to `legacy/api.ts` — add them to `routes/v2/` and register in `routes/index.ts`."
*Bad*: "Don't touch the legacy module." A bare prohibition makes the agent over-explore looking for the allowed path. Flag every unpaired "don't" / "never" / "avoid" and propose the missing "do".

### Progressive disclosure
*Good*: The always-loaded root file is small. Path- or task-specific guidance lives in nested `AGENTS.md` files (e.g., `services/billing/AGENTS.md`), slash commands, or skills, surfaced only when relevant.
*Bad*: One mega-file with sections that only apply to one subdirectory or one rare task. Identify those sections and recommend moving them to a nested file or a skill.

## Output format

Structure the review as:

```
## Cut (N lines)
- L12–18: <quote>. Reason: <which rubric>. Replacement: <none / shorter line>.

## Rewrite
- L34: <quote>. Issue: bare "don't". Proposed: <do-form>.

## Add
- Tech stack not mentioned. Proposed addition (one-liner or section):
  <draft>

## Verdict
Before: 187 lines. After proposed edits: ~60 lines. Tech stack mentioned: no → added.
```

Be specific. Quote line numbers. Propose replacement text, not just labels.
