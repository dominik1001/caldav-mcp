# Review instructions

## What Important means here

Reserve Important for findings that would break behavior for an MCP
client or a calendar: incorrect logic, dates or times that land on the
wrong day or in the wrong time zone, wrong CalDAV URLs or hrefs, data
written to or deleted from the wrong event or todo, and tool names,
inputs, or outputs that change without a breaking-change commit.
Style, naming, and refactoring suggestions are Nit at most.

## Name the commit

Start the summary heading with `### Code review` and name the head commit
you reviewed in that same heading, by at least its first seven characters.

End the review with `End of review.` on its own line. The workflow fails
the run if this line is missing.

## Cap the nits

Report at most five Nits per review. If you found more, say "plus N
similar items" in the summary instead of posting them inline. If you
found no Important findings, including when you found nothing at all,
lead the summary with "No blocking issues."

## Do not report

- Anything CI already enforces: Biome lint and formatting, typechecks,
  tests, knip, and the generated README tool docs (`npm run docs:check`)
- `package-lock.json` and `CHANGELOG.md`
- Claims in the PR description, such as "tests pass", as evidence either way

## Always check

- A tool's description and `returns` text still match what its handler does
- A new tool in `src/tools/` has a `*.test.ts` next to it
- Whole-day and time zone handling, which has regressed before
  (`src/tools/whole-day.test.ts`)
