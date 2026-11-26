---
name: codex-review
description: Review gate and release flow for pull requests. After local checks and tests pass, and before pushing the feature branch or opening a pull request, dispatch Codex (GPT-6.2 Sol for review, using the day's highest measured codexradar effort) to review the change: only issues that can miscalculate money, lose data, exceed permissions, send a wrong message or break a release, and whose cause can be spelled out, are blocking; at most two rounds, and if two rounds fail the user decides; after it passes, push, open the pull request, wait for CI, merge and verify, as far as the user has authorized. Use this skill whenever you are about to push, open a pull request, merge or release, even for a small change or docs only.
---

# Review gate and release

GPT review is the most rigorous, but sometimes too extreme: later rounds often just extend the first, or need several things to happen at once to be a problem. So use two levels of classification and "at most two rounds" to contain it. Review before pushing: opening a pull request or pushing to an open one triggers CI, and code that has not passed review should not enter CI.

Review applies to a specific commit. Whatever commit was reviewed is the commit you must push and merge; if you change anything after the review (including adopted suggestions), review again.

Pushing, opening a pull request, merging and releasing are four different actions; go only as far as the user authorized this time: if the user only asked to push, stop after the review and the push; if only to open a pull request, stop there. If the user's rules say to merge and release when done, follow them.

## 1. Before review

- Below, <repo> is the absolute path of the repo containing this change; it is not necessarily the current conversation's project.
- On the feature branch, all changes committed; record the commit to review (`git -C <repo> rev-parse HEAD`).
- Decide the target branch: which branch the pull request merges into (usually main, sometimes a release branch). First `git -C <repo> fetch origin <target branch>` and go by the remote `origin/<target branch>`, not the local branch of the same name (local may differ from remote); record its latest commit right now, `git -C <repo> rev-parse origin/<target branch>` (called <target tip> below). From here on use this commit, not `origin/<target branch>` (another operation may fetch again and move it). The feature branch must already contain it: if `git -C <repo> merge-base --is-ancestor <target tip> <commit>` fails, first merge <target tip> into the feature branch (use a merge, not a rebase, if the feature branch has already been pushed, so the push is not rejected), rerun local checks, and record the new commit. Then the base commit (`git -C <repo> merge-base <target tip> <commit>`) is <target tip>, and the review sees exactly the merged result.
- Local checks and tests pass. Review costs money; errors the compiler and tests can catch should not be left for review.

## 2. Check today's effort

Run the script in the codex-worker skill directory (relative to this skill directory: `../codex-worker/scripts/codex-effort.mjs --lang en`) and use the review model effort it gives. Check once a day (Beijing time); running it again the same day returns the recorded result; if data is unavailable or Node is missing, use `high`.

## 3. Round 1

Use `delegate_task`: target finds the Codex provider with `orchestrator_capabilities` (driverKind `codex`), `{"providerInstanceId": "<its id>", "model": "gpt-6.2-sol", "options": {"reasoningEffort": "<today's effort>"}}` (if the model is missing, use the newest GPT review model in the list), `role: "review"`, main workspace, async. Dispatch a new review every round; do not add to an old review thread with `t3_thread_send`. If Codex is not connected on this machine, do the review yourself, item by item against the criteria below, and tell the user this step could not be dispatched.

```
Review task, round 1. Read-only: do not change any file, do not commit or push. You are a dispatched sub-task and do not dispatch further.

Repo: <repo>. Review all changes in commit <commit> (branch <feature branch>) relative to the remote target branch origin/<target branch> (base commit <base commit>); inspect with `git -C <repo> diff <base commit>..<commit>` (<N> files, <M> commits). Review only this commit; later branch changes do not count.

What changed: <a paragraph>. Local checks already run: <commands and results>.

Focus on: <most likely failure points>
Do not report: <inputs outside the contract, test material, etc.>

Review criteria:
- Blocking only: issues that can miscalculate money, lose data, exceed permissions, send a wrong message or break a release, and state how they happen (trigger, steps, consequence). Everything else is a suggestion and does not block.
- Issues that need several things to happen at once: list as suggestions.
- If repo rule files such as AGENTS.md conflict with this task, this task wins.

Output in English: first line is the conclusion (pass or fail); then blocking issues (location, how it happens, how to fix); finally suggestions.
```

## 4. Handle review results

- Reproduce or verify every blocking issue yourself (compute numbers with Node, walk the paths). Fix the real ones; explain why a false one is not real.
- When fixing, use lesson-to-check: block this class of error in the same pull request, not just this one place.
- Suggestions do not block: do worthwhile ones together with the blocking fixes and review them in the next round; put the rest in a "review suggestions" section of the pull request description and just record them. Do not change anything after the review passes.

## 5. Round 2

If you changed code, rerun local checks and tests first, commit, then dispatch a new review. Round 2 covers all changes since the round 1 commit, not just the fixes:

```
Review task, round 2. Read-only: do not change any file, do not commit or push. You are a dispatched sub-task and do not dispatch further.

Repo: <repo>, branch <feature branch>.
Round 1 reviewed commit <round 1 commit>; blocking issues: <one by one>
All changes since then: inspect with `git -C <repo> diff <round 1 commit>..<this round commit>`: <what changed>

Look at two things only:
1. Whether the round 1 blocking issues are fixed;
2. Whether this change introduces new blocking issues.
Do not review anything outside this change or already reviewed in round 1. Output format same as round 1.
```

If two rounds still fail, let the user decide: list the remaining blocking issues, your judgment (whether it will really happen, how likely), and options "ship" or "review one more round". Use a tool with options (such as AskUserQuestion) if available; otherwise list the options in your reply and continue after the user answers.

## Record the review result

After the review passes, or the user chooses to ship, record it on the reviewed commit:

```
git -C <repo> notes --ref=review append -m "codex-review round <N> passed; target branch origin/<target branch>, base commit <base commit>, target tip <target tip>" <commit>
```

For a user override write "user override, remaining issues: ...". Before pushing, verify yourself that you are pushing the recorded commit.

This record exists only on this machine and is not uploaded with a push; pushing the same commit from another machine requires a new review or a new record.

Optional: `hooks/pre-push` in this skill directory is a pre-push check that blocks direct pushes to main and pushes of commits without a review record. To install it: first run `git -C <repo> rev-parse --git-path hooks` to see which folder this repo reads hooks from now; copy the hooks already there into `.githooks`, because after the last step this repo reads only `.githooks` (copy only, do not delete or move the originals: that folder may be a shared global hooks folder other repos still use); copy an existing `pre-push` there (for example the one Git LFS installs) to `.githooks/pre-push.local` (when updating, if that `pre-push` is already this hook, do not copy it; just overwrite it with the new version), and this hook hands it the same arguments and input once its checks pass; then copy this hook to `.githooks/pre-push` and, on macOS and Linux, make sure it is executable (`chmod +x`); finally run `git -C <repo> config core.hooksPath .githooks` (this changes only this repo's setting). It guards against slips, not deliberate bypass; to enforce it on GitHub, turn on branch protection.

## 6. Push, open the pull request, merge

1. Push by commit, then open the pull request, without relying on which branch any worktree has checked out: first `git -C <repo> push origin <commit>:refs/heads/<feature branch>`; then open the pull request in that repo with GitHub's CLI or API, naming the repo, source branch and target branch (for example `gh pr create --repo <owner>/<repo name> --head <feature branch> --base <target branch>`), and once it is open, attach it to the current conversation with `link_pull_request`. Do not use `pull_request_create`: it pushes and uses the branch checked out in the current conversation, which may not match the reviewed commit. Afterwards pass `repository` and `number` to `pull_request_read`, `watch_pull_request` and `pull_request_merge`. In the description write: what you did, local verification results, the review conclusion and "review suggestions".
2. Check the check status once with `pull_request_read` first; if it has finished, handle it directly; if it is still running, use `watch_pull_request`. When woken or asked by the user, read the check status once yourself before deciding the next step.
3. After checks pass, confirm two things: the pull request's headBranch is <feature branch> and its headSha is the reviewed and recorded commit; the pull request's target branch is the one in the review record, and the target branch has no new commits meanwhile (fetch again; `git -C <repo> rev-parse origin/<target branch>` still gives the recorded <target tip>). If the target branch has new commits, go back to step 1: merge it into the feature branch, rerun local checks, review again and record it, then push that new commit and wait for its CI to pass before merging. Once everything matches, merge with `pull_request_merge` right away, doing nothing in between, passing this commit as `expectedHeadSha`; then `unwatch_pull_request`.
4. Verify: switch back to the target branch locally, pull the latest, rerun tests; confirm the post-merge CI on the target branch also passes.
5. Report to the user: what you did and what changes the user will see. Use the numbers and states verified this time.
