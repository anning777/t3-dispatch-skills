---
name: deepseek-worker
description: Dispatch DeepSeek V4.1 Flash (via CodeBuddy, thinking effort max, 1M context) to do simple but token-heavy work in an isolated worktree: the same mechanical change across many files, adding tests and test data from an existing example, simple scripts such as format conversion and data cleaning, reading many files or logs to organize them, collecting material online step by step. After handback, accept with commands plus spot checks, commit and merge into the current feature branch, and pass codex-review before release. Use this skill when the work is not hard but takes a lot of reading or writing; also when the user says "bulk change", "add tests", "make test data", "organize logs", "collect material" or "write a conversion script". Work that needs design judgment, or involves money, permissions, data deletion, data migration, concurrency or security, goes to codex-worker or yourself; changes of a few dozen lines whose context is already in hand, do yourself.
---

# Dispatch DeepSeek for simple token-heavy work

DeepSeek V4.1 Flash is cheap and has a large context, good for taking "easy but read-heavy, write-heavy" work off your hands and saving your context and quota. It is less rigorous than Codex, so work given to it must meet two conditions: there is an existing example to follow; the result can be checked by command. What it hands back must pass two gates: your acceptance, and codex-review before merging.

## 1. Whether to dispatch

Dispatch:
- The same mechanical change across many files: renaming, changing call style, moving to a new API, unifying format.
- Adding cases following existing tests, creating test data and sample files.
- Simple scripts: format conversion, data cleaning, one-off statistics.
- Reading many files, logs or material to organize and summarize (read-only; verify the conclusions after handback).
- Collecting material on web pages step by step, searching many sources and organizing them (it has web search, page reading and T3's built-in browser).

Do not dispatch:
- Work that needs design judgment, or an interface that is not fixed yet.
- Logic involving money, permissions, data deletion, data migration, concurrency or security.
- Changes of a few dozen lines whose context is already in your hands: the communication cost exceeds doing it yourself.
- Self-contained new modules or algorithms that need rigorous reasoning: dispatch codex-worker.

## 2. Before dispatching

Same as codex-worker step 1 (feature branch, commit dependencies first, verify facts in the brief); see codex-worker in the same skill pack (relative to this skill directory: `../codex-worker/SKILL.md`). No effort check needed: the thinking effort is fixed at max.

In addition:
- Choose an existing pattern as the example and put it in the brief (file and location). It is more reliable following an example than following a description.
- Count the places to change first, and put "changed everywhere" checks into the acceptance criteria, matching at both ends: the old pattern drops to zero; the new pattern grows by exactly the number of old-pattern places counted before dispatch (pre-existing new-pattern places do not count), or list every expected value one by one. Checking only that the old pattern is zero misses a place changed to a wrong value.

## 3. Brief

For code work:

```
Brief

Background: <one or two sentences: what this module does>

Goal: <what to build>

Example: follow <file:line>. <differences to explain>

Scope: <files or directories to change; for bulk changes say how to find them all, e.g. "every place that calls xxx, find with git -C <repo dir> grep -n xxx". Write . for the repo dir when it is the same repo, or ../<repo name> for a cross-repo task>

Acceptance criteria:
- <a command that runs directly>, expected <result>
- Complete: <command counting the old pattern>, expected 0; <command counting the new pattern>, expected <new pattern count before dispatch + old pattern count before dispatch> (or every listed new value matches)

Do not: install dependencies, use the network, commit or push; only change <directory or file scope>.

Working requirements:
- This brief is your only source of requirements. Coding conventions in repo rule files such as AGENTS.md and CLAUDE.md still apply; if they conflict with this brief, the brief wins. You are a dispatched sub-task; only do this brief, do not dispatch further and do not start sub-tasks.
- If a fact or requirement in this brief does not match the code, or following it would go wrong, stop and point it out in your report; do not follow the wrong instruction.
- Do only what the task needs: do not change other things and add no features. If you are unsure whether a place should change, leave it and note it in your report.
- The checks in the acceptance criteria must actually be run and pass.

Report in English; say what you did first, without the debugging process, in at most 30 lines:
1. What you did (one or two sentences)
2. Files changed (if more than 10, just the count and directories)
3. Acceptance criteria one by one: met or not, with the commands run and results
4. What you did not do and why; anything uncertain
```

For read-only organizing work:

```
Organizing task. Read-only: do not change any file, do not commit or push. You are a dispatched sub-task; do not dispatch further and do not start sub-tasks.

Question to answer: <question>
Material: <where the directories, files and logs are, and their scope>
Output: <format, e.g. a list sorted by count>

Requirements: attach a source to every conclusion (file:line, a time in the log, or a URL); mark anything without a source as a guess. Report in English, at most <N> lines.
```

For organizing work that needs the web, state the URLs, steps, question scope and time range under "Material", and add this paragraph:

```
Ask-first list: deleting data, stopping a service, spending money, sending messages externally (anything someone other than the user will receive, including comments on public platforms), changing product direction, creating or rotating keys, changing permissions. If an operation would trigger any item, stop and report; do not click through. If a password or two-factor verification is needed, stop and report too.
```

## 4. Dispatch

Use `delegate_task`:
- target: find the CodeBuddy provider with `orchestrator_capabilities` (its name contains CodeBuddy, and its model list has deepseek), `{"providerInstanceId": "<its id>", "model": "deepseek-v4.1-flash", "options": {"thought_level": "max", "mode": "fullAccess"}}`. If CodeBuddy is not connected on this machine, do not dispatch: do code work yourself or dispatch codex-worker, and tell the user this step could not be dispatched under the rules.
- `isolation: "worktree"`, `role: "implementation"` for code work and `role: "research"` for read-only organizing, async.
- When the code is not in the current conversation's project, follow codex-worker step 3 (add the repo to `trackedFolders`, and state in the brief that changes go in `../<repo name>`).
- Record the repo and feature branch to merge into, the commit at dispatch (`git -C <target repo> rev-parse HEAD`), and the returned sub-task thread ID.

While it runs in the background, continue with other work; do not poll, you will be woken when it is done.

## 5. After handback

1. Read the sub-task thread with `t3_thread_read` to get the worktree path. Below, <copy> is the directory where it changed code: the worktree itself for the same repo, or the sibling `<repo name>` directory for a cross-repo task.
2. `git -C <copy> log -1` is still the dispatch commit (it may not commit); `git -C <copy> status --untracked-files=all` and `git -C <copy> diff --stat`: only files in scope changed, including new files. For read-only organizing work, any change or extra commit means it overstepped; do not adopt the changes, but still verify each conclusion.
3. Run the acceptance commands yourself in <copy>, including both ends of the "changed everywhere" checks.
4. Read the changes:
   - Changes without test coverage: read every place, do not spot-check: config, release and deployment files, data files, facts in docs.
   - Mechanical changes with test coverage: spot-check a few places per class, backed by the tests and the "changed everywhere" checks.
   - New logic (scripts, test assertions): read the whole block.
   - Conclusions of read-only organizing: spot-check sources, and verify every one you will use; stop after verification and do not merge back.
5. If something is wrong: fix a few small errors yourself; if it needs rework, send it to the same sub-task with `t3_thread_send`, then accept again from step 2. If one round of rework still fails, take over yourself or dispatch codex-worker; do not go back and forth.

## 6. Commit and merge back

Same as codex-worker step 5; the commit message says "written by DeepSeek V4.1 Flash (CodeBuddy), reviewed by <your model name>". Merge only into the feature branch; review and release then go through codex-review.
