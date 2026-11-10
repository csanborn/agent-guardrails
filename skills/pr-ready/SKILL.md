---
name: pr-ready
description: The checklist to run before opening or updating a pull request (tests, typecheck, lint, dead code, bypass comments, and a PR body that explains why). Use when you are about to open a PR, push a branch for review, mark a draft ready, or when the user asks whether the change is ready to ship.
---

# PR ready

A reviewer's time is the scarcest thing in the loop. Do not spend it on things a script could have caught.

Run every step. If one fails, fix it and start the list again. Do not open the PR with a known failure and a promise to fix it later.

## 1. The change is complete

- [ ] Every acceptance criterion (or every item in the request) is done, or explicitly listed as not done.
- [ ] New behavior has tests. Fixed bugs have a regression test that failed before the fix.
- [ ] You ran the tests and watched them pass. Do not report a result you did not see.

## 2. The machines agree

Use the project's own scripts (check `package.json`, `Makefile` or the CI config for the exact names):

- [ ] Tests pass.
- [ ] Type check passes.
- [ ] Lint passes with zero warnings.
- [ ] The build passes, if the project has one.

## 3. Nothing is hidden

- [ ] No new lint or type bypass comments. Fix the cause. A `@ts-expect-error` with a reason is the one exception, and only for a gap outside your control.
- [ ] No skipped or focused tests (`.skip`, `.only`, `xit`) left behind.
- [ ] No debug output, commented-out code or TODOs without an owner.

## 4. Nothing is dead

- [ ] Every file, export, function, flag and dependency you added is used.
- [ ] Anything your change orphaned is deleted, not left "for later".
- [ ] The diff contains only this change. Unrelated formatting or refactors go in their own PR.

## 5. The PR explains itself

Write the body for a reviewer who has not seen the conversation:

```markdown
## Why
The problem in one or two sentences, and a link to the issue.

## What changed
- One bullet per meaningful change.

## How it was tested
The commands you ran and what you checked by hand.

## Risks
What could break, and how to roll back.
```

- [ ] The title says what the change does, in the imperative ("Add retry to webhook delivery").
- [ ] "Why" is about the problem, not a restatement of the diff.
- [ ] Screenshots or a recording for any visible UI change.

Then open the PR, and report the link and the checklist result to the user.
