---
name: spec-first
description: Write a short spec with numbered acceptance criteria before coding a feature, then implement and test against those IDs. Use when asked to build, add or change a feature, an endpoint, a component or a behavior that takes more than a few lines, or when the request is vague enough that "done" is not obvious. Skip it for typo fixes, one-line bug fixes and pure refactors.
---

# Spec first

Code written before "done" is defined drifts toward what was easy to build. A ten-minute spec fixes that.

## 1. Write the spec

Keep it to one screen. Put it where the team keeps specs (an issue, a PR description, or `SPEC.md`); ask if you do not know.

```markdown
# <Feature name>

## Problem
Two or three sentences: who hits what, and why it matters.

## Acceptance criteria
- **AC-1** <One observable behavior, stated so a test can check it.>
- **AC-2** <An edge case or failure mode, with the expected result.>
- **AC-3** <What must not change.>

## Out of scope
- <The tempting extras you are deliberately not doing.>
```

Rules for criteria:

- One behavior per ID. If a criterion has "and" in it, it is probably two.
- Observable: an input and an expected output, a status code, a message, a file on disk. Not "works well" or "is fast".
- Include at least one failure case and one "does not change" case.
- Number them once and never renumber. Add new ones at the end.

## 2. Get it agreed

Show the spec to the user and stop. Resolve open questions now, while they are cheap. Do not start coding on an unanswered question that changes the design.

## 3. Implement against the IDs

- Write the test for a criterion first, name it with the ID (`it('AC-2: rejects an expired token', ...)`), watch it fail, then make it pass.
- Work one criterion at a time. Commit when a group of related criteria passes.
- If you find a case the spec missed, add a new ID and tell the user. Do not quietly widen the scope.

## 4. Close the loop

Before you call it done, walk the list: every ID has a passing test or an explicit note saying why it cannot be automated. Report it as a short table of ID, status and test name.
