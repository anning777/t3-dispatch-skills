---
name: codex-worker
description: Dispatch Codex (GPT-6.2 Astra for code, using the day's highest measured codexradar effort) to write self-contained backend, algorithm, data processing or performance code in an isolated worktree; after handback, read the changes, run tests, commit and merge into the current feature branch. Use this skill when the interface is fixed, the module has nothing to do with the page, and the change is clearly more than a few dozen lines; also when the user says "write a backend / API implementation / data processing / algorithm / performance optimization". Do not dispatch changes of a few dozen lines, review fixes, or features that need back-and-forth interface work with the page; do those yourself. For simple bulk work with an existing example and command-checkable results, dispatch deepseek-worker.
---

# Dispatch Codex for self-contained code

Codex is the most rigorous, but too obedient: one wrong fact in the brief and it follows the wrong fact. So verify every fact in the brief yourself first, and write acceptance criteria as commands that can run directly. Each dispatch costs communication (writing the task, it reading it, you reading the diff and running tests); for small work that cost exceeds the work, so do not dispatch small work.

## 1. Before dispatching

- Confirm you are on the feature branch, not main.
- Commit what it depends on first: interface definitions, types, test skeletons, required dependencies. The worktree is created from the latest commit, so it cannot see uncommitted work; it also cannot install dependencies, so install any new dependency yourself and commit the lockfile.
- Before dispatching, verify every fact in the brief (file names, function names, current behavior).
- Check today's effort: run `scripts/codex-effort.mjs` in this skill directory (`node <skill dir>/scripts/codex-effort.mjs --lang en`) and use the code model effort it gives. Check once a day (Beijing time); running it again the same day returns the recorded result; if data is unavailable or Node is missing, use `high`.

## 2. Brief

```
Brief

Background: <one or two sentences: what this module does and where it sits in the system>

Goal: <what to build>

Interface: <function signatures, routes, data structures; reference committed files and locations>

Acceptance criteria:
- <a command that runs directly>, expected <result>
- <edge cases: ...>

Same kind to change together: <other places where the same fact or capability appears: tests, docs, config, other entry points>

Do not: install dependencies, use the network, commit or push; only change <directory or file scope>.

Working requirements:
- This brief is your only source of requirements. Coding conventions in repo rule files such as AGENTS.md still apply; if they conflict with this brief, the brief wins. You are a dispatched sub-task and do not dispatch further.
- If a fact or requirement in this brief does not match the code, or following it would go wrong, stop and point it out in your report; do not follow the wrong instruction.
- Do only what the task needs: no extra features, switches or flows; add locks, retries, compatibility layers or fallbacks only with a real incident or interface doc as evidence.
- Before starting, list every place and change them together: every place where the same fact or capability appears in code, tests, docs and config, plus the same-kind places named above. Write a reason for anything you do not change.
- The checks in the acceptance criteria must actually be run and pass.

Report in English; say what you did first, without the debugging process:
1. What you did (one or two sentences)
2. Files changed
3. Acceptance criteria one by one: met or not, with the commands run and results
4. What you did not do and why; anything uncertain
```

## 3. Dispatch

Use `delegate_task`:
- target: find the Codex provider with `orchestrator_capabilities` (driverKind `codex`), `{"providerInstanceId": "<its id>", "model": "gpt-6.2-astra", "options": {"reasoningEffort": "<today's effort>"}}`. If the model is missing, use the newest GPT coding model in the list; if Codex is not connected on this machine, do not dispatch, write it yourself, and tell the user this step could not be dispatched.
- `isolation: "worktree"`, `role: "implementation"`, async.
- When the code is not in the current conversation's project (`target.projectId` pointing at another local project is rejected), first use `t3_project_update` to add that repo to the current project's `trackedFolders` (the parameter replaces the whole list: read the current list with `t3_project_list`, append, write, then read again to confirm). The sub-task's worktree will have a sibling directory of the same name, an independent copy of that repo; state in the brief that changes go in `../<repo name>`.
- Record the absolute path of the repo to merge into (called <target repo> below; the main workspace when it is the same repo) and its feature branch.
- Record the returned sub-task thread ID; you will need it to add tasks.

While it runs in the background, continue with the frontend or other work; do not poll, you will be woken when it is done.

## 4. After handback

1. Read the sub-task thread with `t3_thread_read` to get the worktree path (worktreePath). Below, <copy> is the directory where the sub-task changed code: the worktree itself for the same repo, or the sibling `<repo name>` directory for a cross-repo task.
2. `git -C <copy> status --untracked-files=all`: new files do not appear in a normal diff, so always check this step.
3. Read the changes: confirm only the allowed scope changed and the interface matches the brief.
4. Run the acceptance commands yourself in <copy>.
5. If something is wrong: fix what you can in a few dozen lines yourself; if it needs rework, send it to the same sub-task with `t3_thread_send`. It remembers the previous round and is still in the same worktree.

## 5. Commit and merge back

1. Commit in <copy>, add the new files, and record the commit (`git -C <copy> rev-parse HEAD`). The commit message says "written by Codex <model name>, reviewed by <your model name>".
2. On the feature branch of <target repo>, merge by commit: `git -C <target repo> merge --ff-only <commit>`. If you committed anything else to the feature branch meanwhile, the fast-forward fails; then use `git -C <target repo> merge --no-ff <commit>`. Do not merge by branch name: several repos can have branches with the same name. After merging, confirm with `git -C <target repo> merge-base --is-ancestor <commit> HEAD` that it is on the feature branch.
3. After merging back, rerun the tests.
4. Merge only into the feature branch, never into main. main is updated only through pull requests. Review and release then go through codex-review.
