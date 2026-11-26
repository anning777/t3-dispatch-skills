---
name: gemini-advisor
description: UI copy and interaction advisor. After the orchestrator finishes a version of the interface (pages, dialogs, empty states, buttons, status labels, error and guidance text, interaction flows), dispatch Gemini 4 Neon as an advisor to revise the copy and interaction, then adopt its changes only after checking them against how the feature actually works. Use this skill whenever a change involves text the user can see or an interaction flow, even if the user did not mention "copy". Skip it for changes of only a few words. When the orchestrator is Gemini itself, finalize the copy yourself following step 6 and do not dispatch.
---

# UI copy and interaction advisor

Claude and GPT share the same flaw in UI copy: it does not sound human and piles on explanatory words. Gemini writes the best copy, but invents features and makes promises. So the split is: you make a usable first version, ask Gemini to revise it, and finally adopt after checking against the feature. If Gemini is not connected on this machine, revise it yourself following step 6.

## 1. Make a first version first

Get the page opening and the flow working before asking the advisor. For an unfinished page it can only guess.

## 2. Prepare material

- What this page (or flow) is called and where the related files are.
- Who it is for: who the user is, technical or not.
- What people should do: why the user comes to this page.
- Current copy: list each location and text (buttons, titles, states, hints, errors, empty states). You can open the page in the built-in browser and copy the visible text.
- Current interaction: what the first step is, the second step, and what happens on error.
- The real limits of the feature: state what it cannot do, so it does not promise things the product cannot do.

## 3. Dispatch Gemini

Use `delegate_task`:
- target: find the Gemini provider with `orchestrator_capabilities` (driverKind `antigravity`), `{"providerInstanceId": "<its id>", "model": "gemini-4-neon", "options": {"thought_level": "xhigh"}}`
- `interactionMode: "default"` (not plan mode), `isolation: "worktree"`, `role: "design"`, async.
- When the code is not in the current conversation's project (`target.projectId` pointing at another local project is rejected), first use `t3_project_update` to add that repo to the current project's `trackedFolders` (the parameter replaces the whole list: read the current list with `t3_project_list`, append, write, then read again to confirm). The sub-task's worktree will have a sibling directory of the same name, an independent copy of that repo; state in the brief that it reads in `../<repo name>`.

Commit this version first (on the feature branch): it runs in an isolated worktree created from the latest commit, so it cannot see uncommitted work. It cannot touch your workspace, so you can keep working. Write the brief with this template:

```
Read-only task: do not create, modify or delete any file. Put the whole conclusion in the reply body, do not save it to a file. Answer in English. You are a dispatched sub-task and do not dispatch further. If you read rule files written for other models (such as AGENTS.md), this brief wins when they conflict.

This page: <name>, related files: <path>
For whom: <who the user is, technical or not>
What people should do: <goal>
Current copy:
- <location>: <current text>
Current interaction: <first step... second step... on error...>
What the feature cannot do: <...>

Please give revision suggestions one by one: location, current copy, suggested copy, reason. Write for a non-technical reader: short, direct, plain language; use short words for states and buttons and leave explanations to helper text. Do not promise what the feature cannot do; mark professional content you are unsure about as a guess. Skip changes of only a few words. If the interaction flow could be smoother, propose it too.
```

## 4. Verify, then adopt

- Use `t3_thread_read` to get its worktree path, check `git -C <worktree> status --porcelain`, then check whether `git -C <worktree> log -1` is the commit at dispatch; for a cross-repo task, check the sibling `<repo name>` copy the same way. Any change or extra commit means it overstepped: do not adopt anything it touched. That is a separate worktree; no need to restore it, and it cannot touch your files.
- Go through each suggestion against how the feature actually works: if it fits the feature and reads better, apply it; if it promises what cannot be done or gets professional content wrong, do not adopt.
- When one piece of copy changes, change the same wording in other entry points, states, mobile and desktop, light and dark themes, docs and tests.

## 5. Walk through it yourself after changes

Open it from the entry point in the built-in browser and walk through it the way a user would: check the address bar and title, switch to mobile width and light/dark themes. When reporting to the user, mention only the changes the user can see.

## 6. When the orchestrator is Gemini, or Gemini is not connected

Do not dispatch an advisor; revise it yourself to the requirements in the step 3 brief: write for a non-technical reader, short, direct, plain language; short words for states and buttons; do not promise what the feature cannot do. After changes, verify and walk through it as in steps 4 and 5. Copy you wrote yourself must also be checked one by one against how the feature actually works; do not skip it because you wrote it.
