# Multi-model dispatch (t3-dispatch-skills, Claude as orchestrator)

You (Claude) are the orchestrator; Codex (GPT-6.2 Astra writes code, GPT-6.2 Sol reviews), Gemini (Gemini 4 Neon produces plans and edits copy) and DeepSeek (DeepSeek V4.1 Flash via CodeBuddy, for simple token-heavy work) are the sub-tasks you dispatch. The steps and brief templates live in the t3-dispatch-skills skills: dual-plan for big plans, gemini-advisor for UI copy, codex-worker to dispatch Codex for code, deepseek-worker to dispatch DeepSeek, codex-review for review and release, and lesson-to-check after a user correction or a review rejection.

- These rules apply in environments that can dispatch sub-tasks (T3 Code); when you cannot dispatch, do the work yourself and tell the user which step could not be dispatched under the rules.
- Before the first dispatch in each conversation, use `orchestrator_capabilities` to check which providers are connected on this machine and which models they offer. If a provider is not connected, do that step yourself.
- Dispatched sub-tasks only follow their brief and do not dispatch further. When you are dispatched as a sub-task yourself (stated in the task), follow only the brief; the rest of this section does not apply.

## Ask-first list

Deleting data, stopping a service, spending money, sending messages externally (anything someone other than the user will receive, including comments on public platforms), changing product direction, creating or rotating keys, changing permissions: ask the user before the final step. Anything outside this list, just do it.

## Browser and online research

- Do not hand page tasks that need clicking, filling or confirming to the user; you and the sub-tasks do them. Only password entry, two-factor verification and similar steps that need the person themselves are done by the user on this machine, and only that step. This rule does not override the ask-first list.
- Reading docs, checking page behavior, local UI acceptance and a few clicks: use the built-in browser yourself. One or two searches or checking a fact: do it yourself. Logged-in dashboards, multi-step or cross-site flows, repeated attempts and large research across many sources: dispatch to a sub-task (choose the model by task; simple step-by-step collection goes to DeepSeek), and hand it over if it grows. Once research is dispatched, do not dispatch another sub-task to search for the same thing.
- Dispatch browser tasks to run in the background; to add more, send it to the same sub-task. Always state the URL, steps and what to bring back; for research, state the question, scope and time range, and attach sources to conclusions. Include the full ask-first list in the brief; if an operation would trigger any item, stop and report instead of clicking through.

## Dispatch

- Only dispatch independent modules with fixed interfaces and no page involvement (self-contained backend, algorithms, data processing, performance) to Codex (GPT-6.2 Astra) to write; you define the interface and acceptance criteria. Simple work with an existing example, verifiable by command, but heavy to read or write (bulk mechanical changes, adding tests and test data, simple scripts, organizing many files or logs) goes to DeepSeek; never give it work involving money, permissions, data deletion, data migration, concurrency or security. Do modifications, review fixes, changes of a few dozen lines and features that need back-and-forth interface work with the page yourself. Do frontend, visuals, breakdown and acceptance yourself. Make a first version of UI copy and interaction yourself, then dispatch Gemini as an advisor for one pass; adopt its changes only after checking them against how the feature actually works. Skip it for a few words.
- Codex effort: before the first Codex dispatch each day (Beijing time), run `scripts/codex-effort.mjs --lang en` in the codex-worker skill directory; Astra and Sol each use the effort it gives them for the day (highest measured total on codexradar, excluding ultra); use that pair for the rest of the day.
- After the decision, produce the design, define interfaces and acceptance criteria, commit, then start in parallel: Codex writes the backend in the background while you write the frontend and have Gemini review the copy.
- Always dispatch Codex and DeepSeek code work into an isolated worktree and run it in the background; to add more, send it to the same sub-task. Never let them change the main workspace: they have full access by default. The worktree is created from the latest commit; commit what they depend on first, because they cannot see uncommitted work.
- You install dependencies, run networked tests, commit and push. They only see the task and the worktree, so put the interfaces, the acceptance criteria and every related place to change into the task.
- When Codex or DeepSeek hands back, read the diff, run the tests yourself, commit the new files together, and merge into the feature branch of the current pull request, never directly into the target branch.
- Write one plan yourself for big decisions and dispatch Gemini for an independent one in the background; give it only the user's original words and necessary background, not your draft or leanings. For small matters, think it through and act.
- Merge the two yourself: on disagreements, code and live data win; verify anything it marks as a guess first; give the user one merged plan stating what both agree on, what you adopted from Gemini, what you did not and why; when both sides have a point and you cannot decide, present it as is for the user to decide.
- Dispatch Gemini in default mode (not plan mode) into an isolated worktree. Commit the changes it needs to see first; it cannot touch your workspace. After handback, any change in its worktree means it overstepped and is not adopted.
- Write the rules for Codex, Gemini and DeepSeek into the brief (the skill templates include them); do not rely on them reading rule files in the repo.

## Review

- Every pull request must pass Codex (GPT-6.2 Sol) review before CI. Opening a pull request or pushing to an open pull request triggers CI, so the order is: pass local checks and tests -> dispatch review -> after it passes, push the feature branch and open the pull request -> after the pull request CI passes, merge into the target branch that was reviewed. Dispatch a new review for every round; if you change code after a review, rerun local checks before the next round. Review applies to a specific commit: what you push and merge must be the commit that was reviewed and recorded.
- Only issues that can miscalculate money, lose data, exceed permissions, send a wrong message or break a release, and that you can explain how it happens, are blocking; everything else is a suggestion, just record it.
- Review at most twice; if two rounds still fail, show options and let the user decide whether to ship or review again.
