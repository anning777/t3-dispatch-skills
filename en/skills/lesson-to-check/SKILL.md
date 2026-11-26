---
name: lesson-to-check
description: Use after one user correction or one review rejection: block that class of error in the same pull request that fixes it. Write a check (type constraint or guard test) when a machine can judge it, change the structure so the wrong pattern cannot be written when that works, and only write a text rule when neither is possible, saying why a check was not possible. Use this skill when the user says "wrong again", "you missed this", "no" or "there is a problem here", or when a review lists blocking issues; never fix only that one place.
---

# Block this class of error

Fixing only the place that was pointed out means the same class of error returns next time. Text rules are the easiest to ignore; if a machine can block it, let the machine block it.

## 1. Fix it first, then review every same-kind place

- Fix the place that was pointed out.
- Find the same kind the same way: search the repo for the wrong pattern (`git -C <repo> grep`), and think about other entry points, variants, mobile and desktop, light and dark themes, docs, tests and config where the same fact appears. Fix them all at once and report once.

## 2. Choose the guard, in order

1. **Write a check**: type constraints, guard tests (the test name says which class of error it blocks), script checks (wired into CI or Git hooks). The error message must say how to fix it, not just "wrong".
2. **Change the structure**: change the interface signature, directory or wrapper so the wrong pattern cannot be written at all.
3. **Write a text rule**: only when the first two are impossible. State only what to do and not do, without the incident, date or reason. Where to write it:
   - For you (the orchestrator): things common to all projects go into your global rule file; project-specific ones go into that project's rule file (CLAUDE.md, AGENTS.md and the like);
   - For dispatched sub-tasks (Codex, Gemini, DeepSeek): change the brief template of the matching skill in this skill pack.

Checks and structural changes go in the same pull request as the fix.

## 3. Existing violations

When adding a check, record existing violations in the repo as debt (for example an allowlist); the check only errors on things outside the list. The list may only shrink; new code may not add a single entry.

## 4. Commit message

At the end of the commit message write a "handling:" paragraph: which part used a check or structure and what it blocks; which part can only be a text rule, and why a check was impossible.

## 5. Clean up text rules

- If a text rule already has a check guarding it, keep one sentence and name the check.
- If a check fully guards it, delete that text.

## Example

Round 1 review rejection: "The rule says to merge Codex's changes back to the main branch, which bypasses review and CI."
- Check: added `.githooks/pre-push`, which refuses local pushes to main and says "push to the feature branch and open a pull request".
- Text: changed the rule to "merge into the feature branch of the current pull request". That part cannot be a check, because merging into any local branch can be legitimate.
- Keep only one sentence in the rule, naming `.githooks/pre-push` as the guard.
