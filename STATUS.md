# MCParrot Status

This page is the single home for the status of every MCParrot capability.
It tells coding agents what is shipped, what is dormant, what is aspirational, and which gaps are known.
The [product specification](README.md) describes how each capability behaves, and this page only records whether it exists and what proves it.
Nathan reads the same facts in plain language in the [status guide](public/docs/status.html).
Update both pages in the same change whenever a capability's status changes.

Today, MCParrot is a hosted dashboard that runs on Vercel behind Vercel Authentication.
Users create website apps, explore any website with MCParrot Explorer in a normal browser tab, ask Cursor Composer 2.5 Fast to find what the site can do, and save the capabilities they choose as tasks in Upstash Redis.
Each app page offers **Sign in to website** through a Browser Use cloud browser and a private ChatGPT connection link whose MCP route serves that app's saved reading tasks.
The MCP route passed a direct Node check, but Browser Use sign-in, task execution, and live ChatGPT use still need Nathan's demonstration.
Sentry error monitoring, Tracing, Logs, Session Replay, and AI agent monitoring are wired in, but they need events from Nathan's use of the deployed app.
Task testing, the management connection, and automatic sign-in recovery remain aspirational.

## Status word meanings

The [documentation guide](DOCUMENTATION.md#use-status-vocabulary) is the home for the rules behind these words.

| Word | Meaning |
| --- | --- |
| shipped | Exists and runs today, with code and a check that ran and passed |
| dormant | Code exists, but nothing uses it yet |
| aspirational | Designed or agreed, but not built |
| gap | A known missing foundation or defect inside something shipped |

## Capability status

| Capability | Status | Evidence or next step |
| --- | --- | --- |
| Workspace dashboard | shipped | `app/page.tsx` creates website apps, opens exploration, and lists chosen tasks; automatic type and production build checks pass |
| App and exploration addresses | shipped | `/apps/<app-id>` and `/apps/<app-id>/explore` use browser history and Next.js rewrites; automatic type and production build checks pass; Nathan tests live navigation |
| App deletion | shipped | Inline confirmation removes an app and its tasks from storage and asks the extension to delete its recorded requests; automatic checks pass; management MCP parity remains a gap |
| Persistent storage in Upstash Redis | gap | `/api/workspace` stores the workspace under one Redis key, and a direct Node check saved and read it through the same storage functions on a temporary Upstash database on October 17, 2026; the production store needs Nathan to finish the Upstash setup in Vercel |
| Hosted dashboard on Vercel | shipped | The first Git-triggered deployment passed its build and public HTTP checks on October 17, 2026 |
| Vercel Authentication | shipped | On October 17, 2026, the production address redirected to Vercel sign-in before serving the app |
| HTML guides in the app | shipped | `public/docs/` returned its pages and assets from the local development server and from https://mcparrot.vercel.app/docs on October 17, 2026 |
| Explore any website | gap | MCParrot Explorer 0.2.0 records data requests with short response samples in the opened tab; syntax checks pass; Nathan's live recording demonstration must pass |
| Capability discovery with Cursor Composer | shipped | `/api/discover` returned three capabilities with inputs from three sample requests in a direct Node check through the Cursor SDK on October 17, 2026; discovery on Vercel and from a live recording needs Nathan's demonstration |
| Choose and save tasks | shipped | The checklist saves ticked, edited capabilities as the app's tasks; automatic type and production build checks pass; Nathan tests the live flow |
| MCP server per website app | shipped | `/mcp/apps/<app-id>` answered initialize, listed only the GET task as a read-only tool, returned the signed-out tool error, and returned 404 for an unknown app in a direct Node check of the route handler on October 17, 2026 |
| Private ChatGPT connection link | gap | The Vercel automation bypass secret exists and the app page shows the link with **Copy link**; a live ChatGPT connector needs Nathan's test |
| Sign-in through Browser Use | gap | `/api/sign-in` creates the app's Browser Use profile, starts a cloud browser with its live view, and stops it on **Done signing in**; it needs Nathan's live sign-in |
| Running tasks from ChatGPT | gap | Each tool call runs the task's GET requests inside a Browser Use browser with the app's profile and returns the response or a signed-out error; it needs Nathan's live ChatGPT request |
| Browser Use Cloud task runner | dormant | `browser.mjs` passes the syntax check, but no product path uses it; sign-in and tasks use Browser Use cloud browsers directly |
| UI and MCP parity | gap | App connections run saved tasks, but no dashboard capability has a management MCP operation |
| Task testing with changed inputs | aspirational | Run a chosen task's requests with changed inputs and compare the result with the website before it becomes a tool |
| Task input derivation | aspirational | Separate task inputs from authentication data and unrelated traffic in a tested request sequence |
| Write tasks | aspirational | Run tasks that change website data; the first version runs GET requests only |
| Management MCP connection | aspirational | Add MCP operations that match each dashboard capability; Nathan scoped the first version to app connections only |
| Owner authentication | aspirational | Product accounts, MCP sign-in, and multi-user ownership remain unavailable; the private link is the only MCP access control |
| Session reconnection and verification | aspirational | Keep a pending operation through session expiry and Duo, then resume it; today the tool returns a signed-out error instead |
| Saved credentials | aspirational | Optional per-website username/password entry, replacement, and deletion require durable encrypted storage, a separate managed key, and product owner authorization |
| Long task status | aspirational | Store operation status for tasks that take longer than one 60-second request |
| Sentry connection and source maps | shipped | `@sentry/nextjs` starts in the browser and on the server; on October 17, 2026, the production build uploaded source maps, and a direct Node event sent with the project's DSN reached `nathan-s4/mcparrot`, where the Sentry API returned it |
| Sentry error monitoring | gap | Server route errors, React render errors, and Composer failures go to Sentry Issues; events from the deployed app need Nathan's use |
| Sentry Tracing | gap | Spans cover Composer discovery, Browser Use start and stop, the CDP connection, and each task request; traces from the deployed app need Nathan's use |
| Sentry Logs | gap | Discovery, sign-in, and task outcomes go to Sentry Logs through the SDK, not a Vercel Log Drain, which needs a paid plan; the direct Node test log was sent, but the available token cannot read logs to confirm it arrived |
| Sentry Session Replay | gap | Every dashboard session is recorded with text and inputs masked; replays need Nathan's use |
| Sentry AI agent monitoring | gap | The Composer call is a `gen_ai.invoke_agent` span, and each ChatGPT tool call is an MCP span; they need Nathan's use |
| Sentry evidence that changed the product | gap | Find a real failure or delay in Sentry during Nathan's testing, change MCParrot because of it, and show both in the demo |
| Second website support | aspirational | Teach and run a task on a second website with the same product flow |

A syntax check does not prove that a live browser task works, so it never counts as evidence that a browser capability is shipped.

## Shipped work evidence

The dashboard uses the Calm workspace design, with light surfaces, teal actions, and a simple website list.
It runs locally and at [mcparrot.vercel.app](https://mcparrot.vercel.app), where Vercel publishes each push to `main`.
The first Git-triggered deployment passed its build and public HTTP checks on October 17, 2026.
In that check, the dashboard and its JavaScript assets returned successfully, and the local sign-in and private-state paths returned 404.

On October 17, 2026, the discovery route sent three sample requests from a public test website to Cursor Composer 2.5 Fast through the Cursor SDK and returned three capabilities with their requests and inputs in about five seconds.
That check called the route handler directly from Node; it does not prove discovery on Vercel or from a live recording.

On October 17, 2026, a direct Node check saved a test app with one GET task and one POST task to a temporary Upstash database and called the MCP route handler.
The route answered initialize with the server name, listed only the GET task as a read-only tool with its input, returned the signed-out tool error because the app had no sign-in, and returned 404 for an unknown app.
That check does not prove the production store, Browser Use sign-in, task execution, or a live ChatGPT connector.

On October 17, 2026, the production build uploaded source maps to the Sentry project `nathan-s4/mcparrot`.
A direct Node script then sent one test error and one test log with the project's DSN, and the Sentry API returned the test error by its event ID.
The available auth token cannot read organization data, so the API could not confirm the log.
That check proves the project receives events, not that the deployed app sends them.

## Known gaps

These gaps exist inside shipped work and stay open until a change closes them:

- The dashboard has no management MCP operations, including `delete_app`, sign-in, and the discovery operations, which breaks the [UI and MCP parity rule](README.md#ui-and-mcp-parity).
- The production Upstash store needs Nathan to finish its setup in Vercel before apps and tasks can load.
- Browser Use sign-in, task execution, and a live ChatGPT connector need Nathan's production demonstration.
- Saved tasks become tools without a test, run GET requests only, and fail when a website needs header tokens instead of cookies.
- Anyone with an app's connection link can use the whole site until the bypass secret is regenerated.
- Live recording with the extension and discovery from that recording need Nathan's production demonstration.
- The extension requires one manual unpacked installation and Chrome or Edge. It has no store listing, automatic updates, or management MCP controls.
- Sentry has not yet received errors, traces, logs, or replays from the deployed app, and no Sentry evidence has changed the product yet.

## Aspirational work order

The product work happens in these stages, and each stage ends when its completion check passes in a demonstration.
The first stage starts with one reading task found during a recorded browsing session, such as listing Canvas assignments.
The broader discovery experience must suggest several tasks from one session and keep untested suggestions unavailable.
It must show that authenticated API requests can be reused, not only that a browser can navigate the website.
Interface polish and broad task support come after this proof.
For how the demo must present Browser Use and Sentry to judges, see [hackathon judging and prizes](HACKATHON.md).

| Stage | Work | Completion check |
| --- | --- | --- |
| 1. Prove discovery and API execution | Explore a reading page, find capabilities, choose one task, and sign in through Browser Use | Run the saved request in the signed-in Browser Use browser and check the result |
| 2. Prove MCP use | Add the app's connection link to ChatGPT | Request the task from ChatGPT with changed inputs |
| 3. Use Sentry evidence | Collect errors, traces, logs, and replays from Nathan's testing | Diagnose and fix a real problem using captured evidence |
| 4. Build task management | Add changed-input tests and publication for chosen tasks | Discover several tasks in one session and reuse each enabled task |
| 5. Prove reconnection | Preserve an operation through session expiry and user verification | Reconnect and finish the pending task without duplicate effects |
| 6. Prove general use | Teach a task on a second website | Reuse the same product flow without a website-specific architecture |
| 7. Prepare the demo | Show teaching, assistant use, and the Sentry-backed improvement | Complete the demonstrated flow and explain its limits |
