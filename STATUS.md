# MCParrot Status

This page is the single home for the status of every MCParrot capability.
It tells coding agents what is shipped, what is dormant, what is aspirational, and which gaps are known.
The [product specification](README.md) describes how each capability behaves, and this page only records whether it exists and what proves it.
Nathan reads the same facts in plain language in the [status guide](public/docs/status.html).
Update both pages in the same change whenever a capability's status changes.

Today, MCParrot is a hosted dashboard; local teaching and sign-in diagnostics are dormant.
The dashboard runs on Vercel and lets users create website apps and explore them without naming tasks first, and keeps app metadata in this browser’s local storage. Its exploration screen uses MCParrot Explorer in a normal browser tab; earlier cloud sessions remain accessible separately; production sign-in, capture, and replay still need Nathan’s demonstration.
The local diagnostic signed in to Berkeley's Canvas with Duo verification on Nathan's computer and kept that session after a reload.
The local pilot captured two reading requests from Nathan’s browsing, including a syllabus visit. Hosted recording and replay have a production proof gap; broader task discovery, remote MCP access, persistent storage, and Sentry remain aspirational.

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
| Workspace dashboard | shipped | `app/page.tsx` creates website apps and opens exploration; older task drafts remain accessible; automatic type and production build checks pass |
| App and task addresses | shipped | Stable app and task addresses use browser history and Next.js rewrites; automatic type and production build checks pass; Nathan tests live navigation |
| Local app deletion | shipped | Inline confirmation removes an app and its drafts from browser storage; automatic type and production build checks pass; management MCP parity remains a gap |
| Browser draft metadata | shipped | App and task metadata uses local storage after refresh; automatic type and production build checks pass; captures and sign-in data are excluded |
| Hosted dashboard on Vercel | shipped | The first Git-triggered deployment passed its build and public HTTP checks on October 17, 2026 |
| HTML guides in the app | shipped | `public/docs/` returned its pages and assets from the local development server and from https://mcparrot.vercel.app/docs on October 17, 2026 |
| Local Berkeley sign-in diagnostic | dormant | A live test completed CalNet sign-in, SMS verification, and Canvas access, and the session survived a reload |
| Local headless browser launcher | dormant | `browser-local.mjs` started the headless Chrome profile that the live sign-in test used |
| Cloud Canvas sign-in | gap | Protected saved-credential and in-app SMS operations exist; automatic remote checks and Nathan’s production sign-in test must pass |
| Automatic Duo steps in the diagnostic | gap | Code exists, but a full clean rerun of the automatic focus, SMS, and trust steps has not run |
| Browser Use Cloud task runner | dormant | `browser.mjs` passes the syntax check, but no product path uses it and no live run is recorded |
| UI and MCP parity | gap | The dashboard has no MCP access, so no capability meets the parity rule |
| Local teaching connection controls | dormant | Earlier local pairing code remains outside the product UI; the production-only workflow must not launch a local helper |
| Local reading request capture | dormant | Nathan reported browsing; the worker status check showed two captures, one JSON candidate and one syllabus candidate, with a selection |
| Hosted teaching controls | gap | The hosted browser opens in a separate popup; reopening uses the same session and captures. Automatic checks pass; Nathan’s sign-in, capture, and replay demonstration must pass |
| Explore-first workspace | shipped | Each website offers Explore website without a task form; review displays all observed reading requests. Hosted type and build checks validate the interface; the live Canvas proof remains a gap |
| Explore more in one session | gap | Continue exploring appends requests without clearing candidates; Nathan must prove capture and replay in production |
| Desired-action notes | shipped | Optional notes stay in this browser and do not create tools or imply support |
| Reopen task drafts | shipped | App and task metadata survives navigation and refresh in the same browser; automatic type and production build checks pass; hosted teaching still needs a live demonstration |
| Local request replay tests | gap | Replay controls and shared local MCP operations exist, but the worker does not retain test evidence and a successful live replay is not established |
| Hosted browser sessions | gap | Production Vercel Authentication and secrets are configured; the first cloud browser launch and Berkeley sign-in need a live demonstration |
| Normal browser exploration | gap | Production exploration offers an unpacked Chrome/Edge extension; hosted checks and Nathan’s selected-tab capture demonstration must pass. Only supported Canvas GET path metadata is observed; no secrets or website content are transferred |
| Extension to cloud handoff | gap | Observations stay in extension storage; importing a candidate into separately authenticated Browser Use execution and replay is not available |
| Request recording | aspirational | Broader request sequences and task derivation remain unavailable; the extension observes narrow reading route metadata only |
| Suggested task discovery | aspirational | Group observed requests into meaningful task cards; the current list labels captured reading requests only; do not enable untested suggestions |
| Task review and publication | aspirational | Let the user confirm names, descriptions, inputs, and results, then test changed inputs before publication |
| Task input derivation | aspirational | Separate task inputs from authentication data and unrelated traffic |
| Recorded request replay | aspirational | Run the recorded API request with valid authentication and check the result |
| MCP server per website app | aspirational | Expose one saved task through an authenticated remote MCP address |
| Management MCP connection | aspirational | Add MCP operations that match each dashboard capability |
| Private pilot access | gap | Vercel Authentication protects all production and preview pages; production access and cloud session ownership need a live check |
| Owner authentication | aspirational | Product accounts, MCP authorization, and multi-user ownership remain unavailable |
| Session reconnection and verification | aspirational | Keep a pending operation through session expiry and Duo, then resume it |
| Private pilot credentials | gap | The single owner can configure Sensitive production credentials; encrypted cloud delivery and the live school flow need a production demonstration |
| Saved credentials | aspirational | Optional per-website username/password entry, replacement, and deletion require durable encrypted storage, a separate managed key, and product owner authorization; the fixed private Canvas environment pair is not a user-managed vault |
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

- The dashboard has no MCP access, including the new `delete_app` operation, which breaks the [UI and MCP parity rule](README.md#ui-and-mcp-parity).
- App and draft metadata stays in one browser only, without product accounts or a hosted database. A signed private session cookie restores hosted teaching only during its 30-minute lifetime.
- Draft tasks are not verified tools and cannot perform website actions.
- Production teaching has hosted connection and recorder source, but no live school proof, durable captures, or remote assistant connection. No local helper is used.
- Capture passed its narrow live check; direct replay still needs a successful test and result review.
- Hosted captures remain in a nonpersistent task session for at most 30 minutes. Worker failure or session deletion loses them; replacing a recording removes its earlier candidates.
- The extension requires one manual unpacked installation and Chrome or Edge. It has no store listing, automatic updates, or management MCP controls.
- Extension observations do not include authentication and cannot yet be imported for cloud testing or publication.
- Cloud saved-credential submission, SMS selection, and the in-app code handoff need Nathan’s live production test; school policies may require manual action.
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
