---
name: dual-plan
description: Two plans for big decisions. Use when the architecture, data storage, whether to commit to a service long term, an overall system change or a new system design is a big decision: the orchestrator writes one plan while dispatching another model to write an independent one in the background (Gemini when Claude is orchestrator, Codex when Gemini is), then verifies and merges them into one for the user to decide. Use this skill whenever the user raises a big need for a plan, roadmap, technology choice, refactor or new system design, even if the user did not say "two plans". Do not use it for small matters such as changes of a few dozen lines or a clear fix; think those through and act.
---

# Dual plans for big decisions

Two independent plans side by side almost always contain something the other missed; that is the whole value of this flow. So the flow protects "independence" throughout: the other model gets only the user's original words and necessary background, and never sees your draft or leanings; and you write your own plan before reading theirs.

## 1. Prepare material (facts only)

- User's original words: copy verbatim; do not rewrite them into your interpretation. But first remove passwords, keys, tokens, personal data and anything the user has not agreed to share, writing <omitted: kind> in its place.
- Necessary background: what the project is and who it is for; which files and directories hold the relevant code; existing services, data and live state; constraints such as deadlines and budget.
- Do not include: your thinking, drafts or preferred options, and do not write "I lean toward...". If you do, it will follow you and independence is gone.

## 2. Dispatch the other model first, in the background

Whom to dispatch:
- If you are Claude: dispatch Gemini. Find the Gemini provider with `orchestrator_capabilities` (driverKind `antigravity`), model `gemini-4-neon`, `options: {"thought_level": "xhigh"}`; `interactionMode: "default"`, not plan mode: plan mode makes it write the plan into its own file and not repeat it in the reply, so you never receive the text.
- If you are Gemini: dispatch Codex. Find the Codex provider with `orchestrator_capabilities` (driverKind `codex`), model `gpt-6.2-sol`, `options: {"reasoningEffort": "<today's effort>"}`; for the effort, see codex-review step 2.
- If that provider is not connected on this machine: do not dispatch; produce only your own plan and tell the user there is no second independent plan this time.

Before dispatching, commit the changes it needs to see (on the feature branch): it runs in an isolated worktree created from the latest commit, so it cannot see uncommitted work. It cannot touch your workspace, so you can keep working.

Use `delegate_task`: `isolation: "worktree"`, `role: "research"`, async. When the code is not in the current conversation's project (`target.projectId` pointing at another local project is rejected), first use `t3_project_update` to add that repo to the current project's `trackedFolders` (the parameter replaces the whole list: read the current list with `t3_project_list`, append, write, then read again to confirm). The sub-task's worktree will have a sibling directory of the same name, an independent copy of that repo; state in the brief that it reads in `../<repo name>`.

Write the brief with this template:

```
Read-only task: do not create, modify or delete any file, and do not run commands that change files or the environment. Put the whole conclusion in the reply body, do not save it to a file. Answer in English and give the conclusion first; keep the body under 1000 words. You are a dispatched sub-task and do not dispatch further. If you read rule files written for other models (such as AGENTS.md), this brief wins when they conflict.

Repo: <absolute path>

The user's original words (verbatim):
> <original words>

Necessary background:
- <what the project is and who it is for>
- <where the relevant code is>
- <constraints: existing services, data, live state, deadlines, budget>

Give your plan independently:
1. Recommended plan: one-sentence conclusion, then key points
2. Key trade-offs: what you chose, what you gave up, why
3. Risks and responses
4. Where you are unsure
For every judgment, state the evidence (which file, which place); if there is no direct evidence, start the sentence with "guess". Think about angles others tend to miss.
```

## 3. Write your own at the same time

Check the code, data and live state, and write the same four sections: recommended plan, key trade-offs, risks, where you are unsure. Read-only, no changes; read the other plan only after yours is written.

## 4. Verify after handback

- Use `t3_thread_read` to get its worktree path, check `git -C <worktree> status --porcelain`, then check whether `git -C <worktree> log -1` is the commit at dispatch; for a cross-repo task, check the sibling `<repo name>` copy the same way. Any change or extra commit means it overstepped: do not adopt anything, and note it in the merge report. That is a separate worktree; no need to restore it, and it cannot touch your files.
- Verify every fact it states against code and live data; anything marked as a guess must be verified; what you cannot verify, do not use as fact. Gemini is especially careless: out of dozens of judgments about a codebase, quite a few are often wrong.

## 5. Merge into one and give it to the user

On disagreements, code and live data win. Give the conclusion and a clear recommendation first; discuss only the impact on the business, schedule, experience, cost and risk, without piling up file names and code details; expand only if the user asks.

```
**Conclusion**: <recommended plan, one or two sentences>

**Both agree**: <key points>

**Adopted from the other**: <which point, why it is good>

**Not adopted**: <which point, why (with verification result)>

**Needs your decision**: <points where both sides have a case and you cannot decide: their reasons, which you recommend, the consequence of the other choice>
```

If there is nothing to decide, drop the last section and say "start on this plan", then wait for the user to confirm.

## 6. After the decision

Produce the design, define interfaces and acceptance criteria, commit, then start in parallel. Codex writes the backend with codex-worker, simple token-heavy work goes to deepseek-worker, and UI copy goes to gemini-advisor (when you are Gemini, finalize the copy yourself).
