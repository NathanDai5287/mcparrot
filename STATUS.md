# MCParrot Status

This page is the single home for the status of every MCParrot capability.
It tells coding agents what is shipped, what is dormant, what is aspirational, and which gaps are known.
The [product specification](README.md) describes how each capability behaves, and this page only records whether it exists and what proves it.
Nathan reads the same facts in plain language in the [status guide](public/docs/status.html).
Update both pages in the same change whenever a capability's status changes.

Today, MCParrot is a hosted dashboard that runs on Vercel behind Vercel Authentication.
Users create website apps, explore any website with MCParrot Explorer in a normal browser tab, ask Cursor Composer 2.5 Fast to find what the site can do, and save the capabilities they choose as tasks in this browser's local storage.
The discovery route returned capabilities from sample requests in a direct Composer check; Nathan's live exploration and discovery still need a demonstration.
Task testing, request replay, remote MCP access, Browser Use sign-in during MCP use, persistent storage, and Sentry remain aspirational.

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
| Local app deletion | shipped | Inline confirmation removes an app and its tasks from browser storage and asks the extension to delete its recorded requests; automatic checks pass; management MCP parity remains a gap |
| Hosted dashboard on Vercel | shipped | The first Git-triggered deployment passed its build and public HTTP checks on October 17, 2026 |
| Vercel Authentication | shipped | On October 17, 2026, the production address redirected to Vercel sign-in before serving the app |
| HTML guides in the app | shipped | `public/docs/` returned its pages and assets from the local development server and from https://mcparrot.vercel.app/docs on October 17, 2026 |
| Explore any website | gap | MCParrot Explorer 0.2.0 records data requests with short response samples in the opened tab; syntax checks pass; Nathan's live recording demonstration must pass |
| Capability discovery with Cursor Composer | shipped | `/api/discover` returned three capabilities with inputs from three sample requests in a direct Node check through the Cursor SDK on October 17, 2026; discovery on Vercel and from a live recording needs Nathan's demonstration |
| Choose and save tasks | shipped | The checklist saves ticked, edited capabilities as the app's tasks in local storage; automatic type and production build checks pass; Nathan tests the live flow |
| Browser Use Cloud task runner | dormant | `browser.mjs` passes the syntax check, but no product path uses it; it is reserved for sign-in and authentication during later MCP use |
| UI and MCP parity | gap | The dashboard has no MCP access, so no capability meets the parity rule |
| Task testing with changed inputs | aspirational | Run a chosen task's requests with changed inputs and compare the result with the website before publication |
| Task input derivation | aspirational | Separate task inputs from authentication data and unrelated traffic in a tested request sequence |
| Recorded request replay | aspirational | Run the recorded API request with valid authentication and check the result |
| MCP server per website app | aspirational | Expose one saved task through an authenticated remote MCP address |
| Management MCP connection | aspirational | Add MCP operations that match each dashboard capability |
| Browser Use sign-in during MCP use | aspirational | After the MCP server exists, Browser Use signs in and passes authentication when tasks run |
| Owner authentication | aspirational | Product accounts, MCP authorization, and multi-user ownership remain unavailable |
| Session reconnection and verification | aspirational | Keep a pending operation through session expiry and Duo, then resume it |
| Saved credentials | aspirational | Optional per-website username/password entry, replacement, and deletion require durable encrypted storage, a separate managed key, and product owner authorization |
| Secure session transfer | aspirational | Prove how session tokens move to request replay without exposing them |
| Persistent storage | aspirational | Store apps, tasks, and operation status in managed PostgreSQL |
| Sentry monitoring | aspirational | Add error monitoring, Tracing, and Logs across the complete path |
| Second website support | aspirational | Teach and run a task on a second website with the same product flow |

A syntax check does not prove that a live browser task works, so it never counts as evidence that a browser capability is shipped.

## Shipped work evidence

The dashboard uses the Calm workspace design, with light surfaces, teal actions, and a simple website list.
It runs locally and at [mcparrot.vercel.app](https://mcparrot.vercel.app), where Vercel publishes each push to `main`.
The first Git-triggered deployment passed its build and public HTTP checks on October 17, 2026.
In that check, the dashboard and its JavaScript assets returned successfully, and the local sign-in and private-state paths returned 404.

On October 17, 2026, the discovery route sent three sample requests from a public test website to Cursor Composer 2.5 Fast through the Cursor SDK and returned three capabilities with their requests and inputs in about five seconds.
That check called the route handler directly from Node; it does not prove discovery on Vercel or from a live recording.

## Known gaps

These gaps exist inside shipped work and stay open until a change closes them:

- The dashboard has no MCP access, including `delete_app` and the discovery operations, which breaks the [UI and MCP parity rule](README.md#ui-and-mcp-parity).
- Apps and tasks stay in one browser only, without product accounts or a hosted database.
- Chosen tasks are not tested or published tools and cannot perform website actions.
- Live recording with the extension and discovery from that recording need Nathan's production demonstration.
- The extension requires one manual unpacked installation and Chrome or Edge. It has no store listing, automatic updates, or management MCP controls.

## Aspirational work order

The product work happens in these stages, and each stage ends when its completion check passes in a demonstration.
The first stage starts with one reading task found during a recorded browsing session, such as listing Canvas assignments.
The broader discovery experience must suggest several tasks from one session and keep untested suggestions unavailable.
It must show that authenticated API requests can be reused, not only that a browser can navigate the website.
Interface polish and broad task support come after this proof.
For how the demo must present Browser Use and Sentry to judges, see [hackathon judging and prizes](HACKATHON.md).

| Stage | Work | Completion check |
| --- | --- | --- |
| 1. Prove discovery and API execution | Explore a reading page, find capabilities, and choose one task | Run the recorded API request with valid authentication and check the result |
| 2. Prove MCP use | Expose that saved task through an authenticated remote MCP server | Request the task from an assistant with changed inputs |
| 3. Add Sentry | Add error monitoring, Tracing, and Logs across the complete path | Diagnose and fix a real problem using captured evidence |
| 4. Build task management | Add changed-input tests and publication for chosen tasks | Discover several tasks in one session and reuse each enabled task |
| 5. Prove reconnection | Use Browser Use to sign in and preserve an operation through session expiry and user verification | Reconnect and finish the pending task without duplicate effects |
| 6. Prove general use | Teach a task on a second website | Reuse the same product flow without a website-specific architecture |
| 7. Prepare the demo | Show teaching, assistant use, and the Sentry-backed improvement | Complete the demonstrated flow and explain its limits |
