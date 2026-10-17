# Working with Nathan

This document tells coding agents how to work with Nathan when they plan or change MCParrot.
Nathan explains his mental model first.
The agent and Nathan then test their understanding until they describe the same product behavior.
Code does not replace this step when the two accounts differ.
The last section explains how agents commit, branch, and merge their changes.
The [product specification](README.md) holds the agreed behavior, and [Working together](docs/working-together.html) is Nathan's version of this guide.

## Start with user experience

Ask Nathan what he expects to see and do when the behavior is unclear.
Describe the proposed experience back to him in plain language.
Start with the user's first action and continue to the expected result.
Keep implementation terms out of this explanation unless Nathan asks for them.
Use one concrete example, but do not treat it as the only use case.

## Test the shared understanding

Compare the two accounts and name each assumption that differs.
Ask focused questions only about real open choices.
Use examples and counterexamples to find where each choice stops applying.
Examine normal use, first setup, sign-in, interruptions, failures, recovery, and what the user must approve.
Continue the exchange until both accounts match.

Separate what the user demonstrates from what an agent does automatically.
Separate the intended experience from capabilities that still need proof.
Challenge contradictions instead of silently filling gaps or agreeing with statements that conflict.

For this product, keep teaching and MCP use distinct in every explanation.
Teaching is when the user shows the app a website task, and MCP use is when an assistant later runs that saved task.
Check whether a new request combines known tasks or needs a new website action.
Do not promise automatic task discovery or sign-in behavior without evidence.
For each capability, explain both the UI path and the agent path, including the verification and browser steps that each path needs.

## Find answers before asking

Read the code, tests, history, and documentation to answer technical questions that the workspace can settle.
Do not ask Nathan for facts that you can find yourself.
Use the decision-queue workflow for a real product choice when an instruction requires it.
Do not ask again for approval of settled details or routine implementation choices.
Existing permission stays valid until Nathan changes the scope.

## Record the agreement

Record settled behavior and open questions as soon as the conversation settles them.
Follow the [documentation rules](DOCUMENTATION.md) for where and how to write them.
When Nathan corrects a premise, replace the old premise everywhere it affects the current plan.
When a capability's status changes, update [the status page](STATUS.md) in the same change.
Confirm shared understanding of important behavior before you implement it.
Do not stop for another confirmation when the conversation already shows that agreement.

## Implement small agreed steps

Choose the simplest complete solution for the agreed behavior, and keep changes inside the requested scope.
Use background agents for large edits, as Nathan's global instructions require.
If a technical experiment is necessary, state the assumption it tests and report the result.
Verify the changed behavior with checks that address the actual risk.
Report the result, the remaining limits, and the related PRs or MRs.

## Commit and merge changes

Commit and push checked changes directly to the `main` branch of the [MCParrot GitHub repository](https://github.com/NathanDai5287/mcparrot).
Do not ask Nathan before you commit or push.
A change is checked when you have verified it against its actual risk, and for code changes `npm run check` and `npm run build` also pass before you push.
Make small commits with clear messages that describe the result users see.
Never commit secrets, `.env` files, browser profiles, or private website content.

Keep `main` ready for a demo at all times, because judges see the public repository and the demo runs from it.
Use a separate branch and a GitHub pull request instead of pushing to `main` in these cases:

- Several agents work in parallel on overlapping files or the same area. Give each agent its own branch, and preferably its own git worktree. Parallel agents that change clearly separate files can commit to `main`.
- The work is an experiment that you may discard, such as proving request recording and replay.
- The change is visible in the UI, and Nathan should see it before it reaches `main`. Include before and after screenshots in the pull request.
- The work happens in the final hours before the Devpost submission or during in-person judging, when `main` must not change unexpectedly. See the [hackathon facts](HACKATHON.md) for the deadline and event details.

Decide when to merge your own pull requests, and merge them yourself after the checks pass and you have verified the result.
Nathan does not need to approve merges.
After each change, report the commit or pull request link in the table of related PRs that Nathan's instructions require.

[The status page](STATUS.md) records the status of automatic deployment from GitHub to Vercel.
Every push to `main` deploys to [the production website](https://mcparrot.vercel.app), and each branch or pull request gets a Vercel preview link.
Nathan can review changes on the live website or a preview link instead of running the app locally.
After each deploy, check the live site and report its link, and fix or revert a broken deploy immediately.
The HTML guides under `docs/` and `prototypes/` are not part of the deployed Next.js app.
