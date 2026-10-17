# MCParrot Status

This page is the single home for the status of every MCParrot capability.
It tells coding agents what is shipped, what is dormant, what is aspirational, and which gaps are known.
The [product specification](README.md) describes how each capability behaves, and this page only records whether it exists and what proves it.
Nathan reads the same facts in plain language in the [status guide](public/docs/status.html).
Update both pages in the same change whenever a capability's status changes.

Today, MCParrot is a hosted dashboard with a local teaching connection and a separate local sign-in diagnostic.
The dashboard runs on Vercel and lets users create website apps and draft tasks, but it keeps them only in page memory. Its Berkeley teaching screen can pair with a local browser worker.
The local diagnostic signed in to Berkeley's Canvas with Duo verification on Nathan's computer and kept that session after a reload.
The local pilot captured two reading requests from Nathan’s browsing, including a syllabus visit. Hosted browsers, broader task discovery, request replay, remote MCP access, persistent storage, and Sentry are aspirational.

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
| Workspace dashboard | shipped | `app/page.tsx` creates website apps, saves draft tasks, and shows a teaching preview; the production check returned it |
| Hosted dashboard on Vercel | shipped | The first Git-triggered deployment passed its build and public HTTP checks on October 17, 2026 |
| HTML guides in the app | shipped | `public/docs/` returned its pages and assets from the local development server and from https://mcparrot.vercel.app/docs on October 17, 2026 |
| Local Berkeley sign-in diagnostic | shipped | A live test completed CalNet sign-in, SMS verification, and Canvas access, and the session survived a reload |
| Local headless browser launcher | shipped | `browser-local.mjs` started the headless Chrome profile that the live sign-in test used |
| Automatic Duo steps in the diagnostic | gap | Code exists, but a full clean rerun of the automatic focus, SMS, and trust steps has not run |
| Browser Use Cloud task runner | dormant | `browser.mjs` passes the syntax check, but no product path uses it and no live run is recorded |
| UI and MCP parity | gap | The dashboard has no MCP access, so no capability meets the parity rule |
| Local teaching connection controls | shipped | Nathan used the production teaching controls; the worker reported recording stopped, two captures, and a selected request |
| Local reading request capture | shipped | Nathan reported browsing; the worker status check showed two captures, one JSON candidate and one syllabus candidate, with a selection |
| Guided teaching controls | shipped | `app/teaching-panel.tsx` shows Connect, Teach, and Review with one main action and extra controls under Details; type and production build checks pass; Nathan tests the live flow |
| Reopen task teaching details | shipped | Panels keep page-session state and suspend hidden polling; automatic type and production build checks pass; Nathan tests the deployed navigation |
| Local request replay tests | gap | Replay controls and shared local MCP operations exist, but the worker does not retain test evidence and a successful live replay is not established |
| Hosted browser sessions | aspirational | Prove a visible teaching window and hidden browser execution and recovery |
| Request recording | aspirational | Capture requests while the user browses selected pages in one visible session |
| Suggested task discovery | aspirational | Group observed requests into task cards for user review; do not enable untested suggestions |
| Task review and publication | aspirational | Let the user confirm names, descriptions, inputs, and results, then test changed inputs before publication |
| Task input derivation | aspirational | Separate task inputs from authentication data and unrelated traffic |
| Recorded request replay | aspirational | Run the recorded API request with valid authentication and check the result |
| MCP server per website app | aspirational | Expose one saved task through an authenticated remote MCP address |
| Management MCP connection | aspirational | Add MCP operations that match each dashboard capability |
| Owner authentication | aspirational | Require sign-in for the dashboard, MCP connections, and verification links |
| Session reconnection and verification | aspirational | Keep a pending operation through session expiry and Duo, then resume it |
| Saved credentials | aspirational | Store optional sign-in credentials with encryption and controlled access |
| Secure session transfer | aspirational | Prove how session tokens move to request replay without exposing them |
| Persistent storage | aspirational | Store apps, tasks, and operation status in managed PostgreSQL |
| Sentry monitoring | aspirational | Add error monitoring, Tracing, and Logs across the complete path |
| Second website support | aspirational | Teach a task on a second website with the same product flow |

A syntax check does not prove that a live browser task works, so it never counts as evidence that a browser capability is shipped.

## Shipped work evidence

The dashboard uses the Calm workspace design, with light surfaces, teal actions, and a simple website list.
It runs locally and at [mcparrot.vercel.app](https://mcparrot.vercel.app), where Vercel publishes each push to `main`.
The first Git-triggered deployment passed its build and public HTTP checks on October 17, 2026.
In that check, the dashboard and its JavaScript assets returned successfully, and the local sign-in and private-state paths returned 404.

The local sign-in diagnostic uses open-source Browser Use 0.13.11 with a separate headless local Chrome profile on Nathan's computer.
Its live test completed CalNet sign-in, SMS verification, and Canvas access.
Authenticated navigation markers stayed present after a page reload, which showed that the browser session can be reused.
The focus, SMS selection, and trust choice first ran through operator commands, and the diagnostic now contains code for them.
The diagnostic is not reachable from the hosted dashboard and does not expose MCP operations.

## Known gaps

These gaps exist inside shipped work and stay open until a change closes them:

- The dashboard has no MCP access, which breaks the [UI and MCP parity rule](README.md#ui-and-mcp-parity).
- Dashboard changes live only in page memory, start from sample data, and reset when the page refreshes.
- Draft tasks are not verified tools and cannot perform website actions.
- The teaching pilot requires the local worker on the same computer; it has no hosted browser, durable captures, or remote assistant connection.
- Capture passed its narrow live check; direct replay still needs a successful test and result review.
- The worker holds one capture. Starting another recording replaces it; earlier task summaries cannot execute that replaced capture.
- The automatic Duo steps in the diagnostic have not had a full clean rerun.
- The diagnostic works only for the Berkeley sign-in page and only on Nathan's computer.

## Aspirational work order

The product work happens in these stages, and each stage ends when its completion check passes in a demonstration.
The first stage starts with one reading task found during a recorded browsing session, such as listing Canvas assignments.
The broader discovery experience must suggest several tasks from one session and keep untested suggestions unavailable.
It must show that authenticated API requests can be reused, not only that a browser can navigate the website.
Interface polish and broad task support come after this proof.
For how the demo must present Browser Use and Sentry to judges, see [hackathon judging and prizes](HACKATHON.md).

| Stage | Work | Completion check |
| --- | --- | --- |
| 1. Prove discovery and API execution | Sign in, browse a reading page, capture requests, and review one suggested task | Run the recorded API request with valid authentication and check the result |
| 2. Prove MCP use | Expose that saved task through an authenticated remote MCP server | Request the task from an assistant with changed inputs |
| 3. Add Sentry | Add error monitoring, Tracing, and Logs across the complete path | Diagnose and fix a real problem using captured evidence |
| 4. Build discovery management | Add browsing sessions, suggested task cards, review, changed-input tests, and publication | Discover several tasks in one session and reuse each enabled task |
| 5. Prove reconnection | Preserve an operation through session expiry and user verification | Reconnect and finish the pending task without duplicate effects |
| 6. Prove general use | Teach a task on a second website | Reuse the same product flow without a website-specific architecture |
| 7. Prepare the demo | Show teaching, assistant use, and the Sentry-backed improvement | Complete the demonstrated flow and explain its limits |
