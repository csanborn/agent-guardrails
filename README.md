# agent-guardrails

[![CI](https://github.com/csanborn/agent-guardrails/actions/workflows/ci.yml/badge.svg)](https://github.com/csanborn/agent-guardrails/actions/workflows/ci.yml)

A small Claude Code plugin that makes coding agents follow the team rules they most often break.

## The problem

Agents are fast, and under pressure they take the same shortcuts a tired human does:

- `// eslint-disable-next-line` or `@ts-ignore` instead of fixing the error.
- `git commit --no-verify` when a pre-commit hook complains.
- `git push --force` onto `main`.
- `rm -rf` with a path that resolves to the repo or your home directory.
- Changing source code and finishing without touching a test.

An instructions file asks nicely. These hooks enforce it, and the agent gets a message telling it what to do instead.

## Install

In Claude Code:

```text
/plugin marketplace add csanborn/agent-guardrails
/plugin install agent-guardrails@agent-guardrails
```

Or from your shell: `claude plugin marketplace add csanborn/agent-guardrails`, then `claude plugin install agent-guardrails@agent-guardrails`.

Needs Node 20 or later on your `PATH`. There is no install step: the hooks ship prebuilt in `dist/` with no dependencies.

To try it without installing, clone the repo and start Claude Code with `claude --plugin-dir ./agent-guardrails`.

## What it does

| Hook | Event | Blocks or nudges | Example message to the agent |
| --- | --- | --- | --- |
| Edit guard | PreToolUse on Edit, Write, MultiEdit | Adding `eslint-disable*`, `@ts-ignore`, `@ts-nocheck`, a bare `@ts-expect-error`, `svelte-ignore`, and in Python `# noqa` and `# type: ignore` | blocked this edit to src/app.ts: it adds `@ts-ignore`. Fix the lint or type error the comment would hide instead of suppressing it. |
| Bash guard | PreToolUse on Bash | `git commit --no-verify` (and `-n`), `git push --no-verify`, force pushes to `main` or `master`, recursive `rm` of `/`, home, the repo root or anything above it | blocked a force push to `main`: it rewrites history that other people build on. Push your work to a feature branch and open a pull request. |
| Test reminder | PostToolUse, Stop, SessionEnd | Nudges once when the session changed source files but no test files | this session changed 2 source files (src/cart.ts, src/price.ts) and no test files. Add or update tests that cover the change and run them. |

Details worth knowing:

- `@ts-expect-error` with a reason (`// @ts-expect-error the SDK types omit beta`) is allowed.
- Only what the change adds counts. Editing a line that already had a bypass comment is not blocked.
- Markdown and text files are skipped, so docs can mention these comments.
- Blocks use the documented PreToolUse JSON (`permissionDecision: "deny"`), so the reason goes straight to the agent.
- The test reminder uses `additionalContext`, not a hard block, and never fires while `stop_hook_active` is true. It cannot loop.
- Any malformed input or internal error exits 0 silently. A guard should never wedge a session.

## Skills

- **`/agent-guardrails:spec-first`**: before coding a feature, write a one-screen spec with numbered acceptance criteria (`AC-1`, `AC-2`), agree it, then implement and name tests by ID.
- **`/agent-guardrails:pr-ready`**: the checklist before opening a PR: tests run and seen passing, typecheck, lint at zero warnings, no bypass comments, no dead code, and a PR body that says why.

Claude also picks them up on its own when the request matches their descriptions.

## Config

Every rule is on by default. Turn one off for a project with `.agent-guardrails.json` at the project root:

```json
{
  "bypassComments": true,
  "noVerify": true,
  "forcePush": true,
  "recursiveRm": true,
  "testReminder": false,
  "protectedBranches": ["main", "master", "release"]
}
```

| Key | Default | Controls |
| --- | --- | --- |
| `bypassComments` | `true` | Edit guard |
| `noVerify` | `true` | `--no-verify` on commit and push |
| `forcePush` | `true` | Force pushes to protected branches |
| `recursiveRm` | `true` | Recursive `rm` of root, home or the repo |
| `testReminder` | `true` | Test reminder |
| `protectedBranches` | `["main", "master"]` | Branches the force push rule protects |

A missing or unparsable file means defaults. A key with the wrong type falls back to its default.

## Limits

These are guardrails against honest shortcuts, not a sandbox. A determined agent (or person) can get around them.

- The shell parser handles quotes, escapes, `;`, `&&`, `||`, pipes, `( )`, `$( )` and `sh -c` strings. It does not expand variables (other than `$HOME`), aliases, functions or `$( )` inside double quotes, and it does not read scripts that a command runs.
- A recursive `rm` whose target uses an unknown variable (`rm -rf "$DIR"`) is allowed, because its value is unknowable before it runs.
- `git push --force` with no refspec asks git for the current branch. A custom `remote.<name>.push` or `push.default` setting can push something else.
- Other ways to skip hooks (`HUSKY=0`, `core.hooksPath`) and other destructive commands (`git reset --hard`, `git clean -fdx`, `find -delete`) are not covered.
- The edit guard matches comment syntax with regular expressions. A bypass written inside a string literal that starts with `//` would be flagged, and an unusual comment style could slip through.
- The test reminder classifies files by path conventions (`*.test.*`, `*_test.go`, `tests/`, and so on). Projects with other conventions may get a reminder they do not need: turn it off in config.
- `MultiEdit` is handled when that tool exists in your Claude Code version.

## Development

```sh
npm ci
npm run lint        # ESLint flat config, strict type-checked, 0 warnings
npm run typecheck   # tsc --strict
npm test            # Vitest
npm run build       # esbuild bundles each hook into dist/
npm run check       # all of the above, and fails if dist/ is stale
```

The tests are table-driven and named by acceptance-criterion ID from [SPEC.md](SPEC.md). Besides unit tests for each rule, `test/built-hooks.test.ts` runs every file in `dist/` as a child process with realistic hook payloads on stdin and checks the exit code and JSON, so the shipped artifact is what gets tested. Another test checks the plugin, marketplace and hooks manifests against their documented shape, and one checks that this repo's own source has no bypass comments. ESLint runs with `noInlineConfig`, so a disable comment would not work here anyway.

`dist/` is committed so the plugin works straight after install. CI rebuilds it and fails if it differs from the source.

## How this was built

I built this by directing AI coding agents (Claude Code), the same way I ship most of my work now. I wrote the brief, the agent wrote [SPEC.md](SPEC.md) first, with an acceptance-criterion ID for every behavior, and then implemented and tested against those IDs. The plugin and hook formats were checked against the official Claude Code docs rather than recalled, and `claude plugin validate` passes on the result.

## License

[MIT](LICENSE)
