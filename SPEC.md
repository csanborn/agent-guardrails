# agent-guardrails spec

Written before any code. Every test names the acceptance criterion it covers, so a reviewer can trace each behavior back to this file.

## Problem

Coding agents are fast and mostly careful, but under pressure they reach for the same shortcuts a tired human does:

- They silence a linter or the type checker with a bypass comment instead of fixing the cause.
- They skip commit hooks with `--no-verify`, or force push over a shared branch.
- They run a recursive delete with a path that resolves somewhere it should not.
- They change source code and finish without touching a test.

Team rules written in an instructions file help, but nothing enforces them. This plugin enforces the few that are cheap to check mechanically, and nudges on the one that is not.

## Scope

A Claude Code plugin with four hooks, two skills, a plugin manifest and a marketplace manifest. No runtime dependencies. No network access.

Out of scope: a general shell parser, a policy language, rules that need a model to judge.

## Acceptance criteria

### Edit guard (PreToolUse on Edit, Write, MultiEdit)

- **AC-E1** Deny a change that adds an ESLint bypass: `eslint-disable`, `eslint-disable-line` or `eslint-disable-next-line` in a comment.
- **AC-E2** Deny a change that adds `@ts-ignore` or `@ts-nocheck`.
- **AC-E3** Deny a change that adds `svelte-ignore`.
- **AC-E4** Deny a change that adds `# noqa` or `# type: ignore`.
- **AC-E5** Allow `@ts-expect-error` followed by a reason. Deny a bare `@ts-expect-error` with a message asking for the reason.
- **AC-E6** Count only what the change adds. A directive already present in `old_string`, or already in the file a Write replaces, is not a new bypass and is not denied.
- **AC-E7** Skip prose files (`.md`, `.mdx`, `.markdown`, `.txt`, `.rst`), where these strings appear as documentation.
- **AC-E8** Deny through the documented PreToolUse JSON (`hookSpecificOutput.permissionDecision: "deny"`) with a reason that names the directive and the file and tells the agent to fix the cause.

### Bash guard (PreToolUse on Bash)

- **AC-B1** Deny `git commit` with `--no-verify` or `-n` (including inside a short flag cluster such as `-anm`), and `git push --no-verify`.
- **AC-B2** Deny a force push (`--force`, `-f`, `--force-with-lease`, `--force-if-includes`, or a `+` refspec) when it targets a protected branch: an explicit destination of `main` or `master` (also as `HEAD:main` or `refs/heads/main`), `--all` or `--mirror`, or no refspec while the current branch is protected.
- **AC-B3** Allow a force push to any other branch, and every ordinary push.
- **AC-B4** Deny a recursive `rm` whose target is the filesystem root, the home directory, the repository root, or a directory that contains the repository root, including the `dir/*` form of each.
- **AC-B5** Text inside quotes is an argument, not a command: `echo "git push --force origin main"` and `git commit -m "skip -n later"` are allowed.
- **AC-B6** Check every command in a chain (`;`, `&&`, `||`, `|`, `&`, newlines), inside `( )` and `$( )` outside quotes, and inside `sh -c`, `bash -c` and `zsh -c` strings.
- **AC-B7** Look through leading `VAR=value` assignments and the wrappers `sudo`, `env`, `command`, `nohup`, `time` and `exec`, and skip git global options such as `-C <path>` and `-c <key=value>`.
- **AC-B8** Deny through the same PreToolUse JSON as AC-E8, with a reason that says what was blocked and what to do instead.

### Test reminder (PostToolUse, Stop, SessionEnd)

- **AC-T1** After each successful Edit, Write or MultiEdit, record the file for the session as a source file, a test file, or neither. Files outside the project directory are ignored.
- **AC-T2** On Stop, when the session changed at least one source file and no test file, return `hookSpecificOutput.additionalContext` asking the agent to add or update tests, listing up to five of the files.
- **AC-T3** Never remind when `stop_hook_active` is true, so the hook cannot loop.
- **AC-T4** Remind once per set of changes. Changing a source file not seen before re-arms the reminder. Changing any test file silences it for the session.
- **AC-T5** Config files (`*.config.*`, dotfiles), type declarations (`*.d.ts`), docs, data and styles are neither source nor test.
- **AC-T6** On SessionEnd, delete the session's state file.

### Config

- **AC-C1** Read `.agent-guardrails.json` from the project directory (`CLAUDE_PROJECT_DIR`, else the hook input's `cwd`). Keys: `bypassComments`, `noVerify`, `forcePush`, `recursiveRm`, `testReminder` (booleans, default `true`) and `protectedBranches` (string array, default `["main", "master"]`).
- **AC-C2** A missing or unparsable file means defaults. An unknown key is ignored. A key with the wrong type falls back to its default.
- **AC-C3** A rule set to `false` lets the matching action through.

### Hook runtime

- **AC-H1** Each hook ships as one prebuilt ESM file in `dist/` with no dependencies, so it works right after install with Node 20 or later on `PATH`.
- **AC-H2** Malformed input or an internal error exits 0 with no output (fail open). A guard must never wedge a session.
- **AC-H3** CI rebuilds `dist/` and fails when the committed files differ.

### Skills

- **AC-S1** `spec-first`: before coding a feature, write a short spec with acceptance-criteria IDs, get it agreed, then implement and test against the IDs.
- **AC-S2** `pr-ready`: the checklist before opening a PR (tests, typecheck, lint, no dead code, no bypass comments, a PR body that explains why).
- **AC-S3** Each skill has frontmatter with a `name` and a trigger-focused `description`.

### Packaging

- **AC-P1** `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` match the documented shape, and `claude plugin validate .` passes.
- **AC-P2** The plugin installs with `/plugin marketplace add csanborn/agent-guardrails` then `/plugin install agent-guardrails@agent-guardrails`.

### Quality

- **AC-Q1** `npm run lint` (0 warnings), `npm run typecheck` (strict), `npm test` and `npm run build` pass locally and in CI on Node 22.
- **AC-Q2** The repository's own source passes its own edit guard: no bypass comments anywhere in `src/`.
