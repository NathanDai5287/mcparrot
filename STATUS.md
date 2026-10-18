# MCParrot Status

This page is the single home for the status of every MCParrot capability.
It tells coding agents what is shipped, what is dormant, what is aspirational, and which gaps are known.
The [product specification](README.md) describes how each capability behaves, and this page only records whether it exists and what proves it.
Nathan reads the same facts in plain language in the [status guide](public/docs/status.html).
Update both pages in the same change whenever a capability's status changes.

Today, MCParrot is a hosted dashboard that runs on Vercel behind Vercel Authentication.
Users create website apps, explore any website with MCParrot Explorer in a normal browser tab, ask Cursor Composer 2.5 Fast to find what the site can do, and save the capabilities they choose as tasks in Upstash Redis.
Each app page offers **Sign in to website** through a Browser Use cloud browser, a **Save login** form that stores an encrypted username and password, and a private ChatGPT connection link whose MCP route serves that app's saved reading tasks, a `read_page` tool for any page on its website, and a `save_task` tool that saves a useful page as a new task.
When a task finds the website signed out, a Browser Use agent signs in again with the saved login, and the user types any text-message code in the ChatGPT chat.
When an app's **Ordering** switch is on, ChatGPT and the app page can prepare, check, place, and cancel orders that a Browser Use agent pays for with Pay with Link, only while Link is in test mode.
On October 17, 2026, the production connection read tasks from the production Redis store and read a Canvas page with the app's Browser Use profile, and Nathan ran Canvas tasks from ChatGPT; automatic sign-in still needs Nathan's demonstration.
Sentry receives errors from the deployed app, and three of them changed the product; Tracing, Logs, Session Replay, and AI agent monitoring still need confirmed events from the deployed app.
Task testing and the management connection remain aspirational.

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
| Persistent storage in Upstash Redis | shipped | `/api/workspace` stores the workspace under one Redis key; on October 17, 2026, the production MCP route listed all 23 Canvas tools from the production Upstash Redis |
| Hosted dashboard on Vercel | shipped | The first Git-triggered deployment passed its build and public HTTP checks on October 17, 2026 |
| Vercel Authentication | shipped | On October 17, 2026, the production address redirected to Vercel sign-in before serving the app |
| HTML guides in the app | shipped | `public/docs/` returned its pages and assets from the local development server and from https://mcparrot.vercel.app/docs on October 17, 2026 |
| Explore any website | gap | MCParrot Explorer 0.4.0 records data requests with short response samples and whole pages with a short visible-text sample in the opened tab; syntax checks pass, and on October 17, 2026 its page snapshot returned the address, status 200, `text/html`, and visible text in local headless Chrome; Nathan's live recording demonstration must pass |
| Capability discovery with Cursor Composer | shipped | `/api/discover` returned three capabilities with inputs from three sample requests in a direct Node check through the Cursor SDK on October 17, 2026; discovery on Vercel and from a live recording needs Nathan's demonstration |
| Choose and save tasks | shipped | The checklist adds ticked, edited capabilities to the app's tasks and skips duplicates; on October 17, 2026, a direct Node check with an in-memory Redis replacement kept a task that `save_task` had saved after a dashboard with an older copy added tasks; Nathan tests the live flow |
| Task-aware discovery and saved results | gap | `/api/discover` sends the app's saved tasks to Composer, marks each suggestion as new or as an update of a saved task, and saves the last result under `discovery:<app-id>`; on October 17, 2026, two runs against `next dev` on a throwaway JSONPlaceholder app did not suggest the saved task again, a third run returned an update with a real task ID that `replaceTask` saved in place, the saved result hid saved items, and deleting the app removed its keys; Nathan's live test of the **New** and **Updates** labels on the explore page must pass |
| MCP server per website app | shipped | `/mcp/apps/<app-id>` answered initialize, listed only the GET task as a read-only tool, returned the signed-out tool error, and returned 404 for an unknown app in a direct Node check of the route handler on October 17, 2026; a later check that day answered an initialize request for protocol version 2026-07-28 with version 2025-11-25 and listed `submit_verification_code` |
| Private ChatGPT connection link | shipped | The app page shows the link with **Copy link**; on October 17, 2026, Nathan added the Canvas app's link to ChatGPT as a Developer mode connector and ran Canvas tasks from ChatGPT |
| Sign-in through Browser Use | gap | `/api/sign-in` creates the app's Browser Use profile, starts a cloud browser with its live view, and stops it on **Done signing in**; it needs Nathan's live sign-in |
| Running tasks from ChatGPT | shipped | Each tool call runs the task's GET requests inside a Browser Use browser with the app's profile and returns the response, with HTML pages as visible text and up to 100,000 characters, or a signed-out error; on October 17, 2026, Nathan ran Canvas tasks from ChatGPT through the production connection |
| Reading any page from ChatGPT | shipped | Each connection's read-only `read_page` tool opens a page on the app's website with the saved sign-in and returns its text; on October 17, 2026, a production `read_page` call on the EECS 126 bCourses syllabus returned status 200 with the syllabus text through the app's Browser Use profile, and Nathan used the same connection from ChatGPT |
| Saving tasks from ChatGPT | gap | Each connection's `save_task` tool adds a page-reading task to the app in Redis; on October 17, 2026, a direct Node check of the route handler with an in-memory Redis replacement listed the tool, rejected another origin, a missing input, an extra input, a duplicate name, and a duplicate URL pattern, and saved a valid task that the next tool list showed; it needs Nathan's live ChatGPT use |
| Delete one task | shipped | Each task on the app page has **Delete**; a direct Node check on October 17, 2026 removed only that task through `PATCH /api/workspace`; Nathan tests the live flow; its management MCP operation remains a parity gap |
| Browser Use Cloud task runner | dormant | `browser.mjs` passes the syntax check, but no product path uses it; sign-in and tasks use Browser Use cloud browsers directly |
| UI and MCP parity | gap | App connections run saved tasks and read pages, but no dashboard capability has a management MCP operation, including the ordering switch and spending limit, and running a task or reading a page has no dashboard control; ordering itself has both paths |
| Task testing with changed inputs | aspirational | Run a chosen task's requests with changed inputs and compare the result with the website before it becomes a tool |
| Task input derivation | aspirational | Separate task inputs from authentication data and unrelated traffic in a tested request sequence |
| Write tasks | aspirational | Run saved tasks that change website data; saved tasks still run GET requests only, and ordering, the first path that changes website data, has its own row |
| Ordering with Pay with Link | gap | `lib/order.ts`, `/api/order`, the app page's **Ordering** section, and the connection's `prepare_order`, `check_order`, `place_order`, and `cancel_order` tools prepare a cart, show it, and pay with Pay with Link only in test mode; on October 17, 2026, a throwaway script passed the safety rules, and checks on the branch's Vercel preview passed the settings, tool list, and refusals, as [ordering checks](#ordering-checks) describes; a live Link status read, a live prepare and place run, and Nathan's DoorDash test must pass |
| Management MCP connection | aspirational | Add MCP operations that match each dashboard capability; Nathan scoped the first version to app connections only |
| Owner authentication | aspirational | Product accounts, MCP sign-in, and multi-user ownership remain unavailable; the private link is the only MCP access control |
| Session reconnection and verification | gap | A signed-out task starts a Browser Use agent sign-in with the saved login, keeps the browser for a text-message code, and `submit_verification_code` finishes sign-in; a direct Node check with Browser Use replaced by a stub returned the code request and stored the pending sign-in on October 17, 2026; Nathan's live Canvas test with Duo must pass |
| Saved credentials | gap | **Save login**, **Replace**, and **Delete** store each app's login in Redis encrypted with AES-256-GCM under `MCPARROT_CREDENTIAL_KEY`; a direct Node check on October 17, 2026 passed the encryption round trip, rejected changed ciphertext, and saved and deleted a login through `/api/login`; Nathan's live save must pass, and per-owner authorization remains aspirational |
| Long task status | aspirational | Store operation status for tasks that take longer than one 300-second request |
| Sentry connection and source maps | shipped | `@sentry/nextjs` starts in the browser and on the server; on October 17, 2026, the production build uploaded source maps, and a direct Node event sent with the project's DSN reached `nathan-s4/mcparrot`, where the Sentry API returned it |
| Sentry error monitoring | shipped | Server route errors, React render errors, and Composer failures go to Sentry Issues; on October 17, 2026, production errors reached `nathan-s4/mcparrot`, including the MCP protocol-version probe, the signed-out message, and a Playwright `browsers.json` module error |
| Sentry Tracing | gap | Spans cover Composer discovery (`discover.composer`), Browser Use start and stop, the CDP connection, each automatic sign-in and verification code agent run with its outcome (`browser_use.agent_sign_in`, `browser_use.agent_verification_code`), each order step with its total and outcome (`browser_use.agent_order_prepare`, `browser_use.agent_order_check_total`, `browser_use.agent_order_place`), each request a task or `read_page` runs (`task.request`), each HTML page opened as text (`page.read`), and each `save_task` call (`task.save`); traces from the deployed app need Nathan's use |
| Sentry Logs | gap | Discovery started and finished, sign-in started and done, login saved and deleted, automatic sign-in started and finished, each verification code outcome, each task run's and `read_page` call's outcome with whether the website was signed out, each task saved from ChatGPT, and each order outcome with only the app ID, the reason, and the amounts go to Sentry Logs through the SDK, not a Vercel Log Drain; the direct Node test log was sent, but the available token cannot read logs to confirm it arrived |
| Sentry Session Replay | gap | Every dashboard session is recorded with text, inputs, and link and image addresses masked; replays need Nathan's use |
| Sentry AI agent monitoring | gap | The Composer call is a `gen_ai.invoke_agent` span, and each ChatGPT tool call is an MCP span; they need Nathan's use |
| Sentry evidence that changed the product | shipped | Three production Sentry errors on October 17, 2026 changed MCParrot: the missing `playwright-core/browsers.json` led to `outputFileTracingIncludes` in `next.config.ts`, the Cursor SDK `ENOENT` under the read-only home folder led to `HOME=/tmp` in `instrumentation.ts`, and the protocol-version error led to the documented fallback and a Sentry ignore rule; the demo must show them |
| Second website support | aspirational | Teach and run a task on a second website with the same product flow |
| Shared app marketplace | aspirational | Let owners share a website app with its saved tasks so other people can reuse it; a shared app must contain only the app address and task definitions, never saved logins, Browser Use profiles, or recorded samples; Nathan added it on October 17, 2026 |

A syntax check does not prove that a live browser task works, so it never counts as evidence that a browser capability is shipped.

## Shipped work evidence

The dashboard uses the Calm workspace design, with light surfaces, teal actions, and a simple website list.
It runs locally and at [mcparrot.vercel.app](https://mcparrot.vercel.app), where it updates only when Nathan asks for a deployment from `main`.
The first Git-triggered deployment passed its build and public HTTP checks on October 17, 2026.
In that check, the dashboard and its JavaScript assets returned successfully, and the local sign-in and private-state paths returned 404.

On October 17, 2026, the discovery route sent three sample requests from a public test website to Cursor Composer 2.5 Fast through the Cursor SDK and returned three capabilities with their requests and inputs in about five seconds.
That check called the route handler directly from Node; it does not prove discovery on Vercel or from a live recording.

Also on October 17, 2026, a Node script called `/api/discover` and `PATCH /api/workspace` on `next dev` with the real Cursor key and storage, for a throwaway app with four JSONPlaceholder recordings.
The first run returned four capabilities; after "Read post" was saved, `GET /api/discover` returned the saved result with its time and without that task, and the second run returned three capabilities without it.
A second app with a weak saved "List posts" task got one update with that task's ID, and `replaceTask` replaced it in place with the same ID; a replacement named `Read page` was skipped.
Deleting each app left none of its `discovery`, `login`, or `pending-sign-in` keys.

On October 17, 2026, a direct Node check saved a test app with one GET task and one POST task to a temporary Upstash database and called the MCP route handler.
The route answered initialize with the server name, listed only the GET task as a read-only tool with its input, returned the signed-out tool error because the app had no sign-in, and returned 404 for an unknown app.
That check does not prove the production store, Browser Use sign-in, task execution, or a live ChatGPT connector.

Later on October 17, 2026, a direct Node check called the route handlers with an in-memory Redis replacement and the real `MCPARROT_CREDENTIAL_KEY`.
An encrypted login decrypted to the same password, its ciphertext did not contain the password, and changed ciphertext was rejected.
`/api/login` saved a login with the hosts `bcourses.berkeley.edu` and `auth.berkeley.edu` without storing the password in plain text, then deleted it.
The MCP route answered an initialize request for protocol version 2026-07-28 with version 2025-11-25, listed `submit_verification_code`, returned the save-login message for a signed-out app without a login, and returned a no-pending message for a code with no waiting sign-in.
With the Browser Use API replaced by a stub, a signed-out app with a saved login created a profile, started one agent run with the password only in secret bindings and a 900-second keep-alive, stored the pending sign-in, and returned the request for a text-message code.
That check cannot prove a real Browser Use run, because the Browser Use key is readable only on Vercel.

Also on October 17, 2026, a direct Node check called the MCP route handler with an in-memory app and a local headless Chrome in place of the Browser Use browser.
The route listed `read_page` as a read-only tool, rejected an address on another origin with the allowed-website error, returned a small HTML page as its visible text without its script, style, or hidden text, returned JSON unchanged, and returned the signed-out message when the page redirected to a sign-in address.
The extension's page snapshot, run in the same kind of browser, returned the page address, status 200, `text/html`, and its visible text.
A later direct Node check that day, with an in-memory Redis replacement, called `save_task` through the route: it rejected another origin, mismatched placeholders, a duplicate name, and a duplicate URL pattern, stored a valid task as one GET request, and the next tool list included it.
A third direct Node check that day called `PATCH /api/workspace`, the MCP route, and `/api/login` with an in-memory Redis replacement.
After `save_task` saved a syllabus task, an add-tasks operation from a dashboard that had loaded the workspace earlier kept that task, added a new one, and skipped a duplicate syllabus task with a different placeholder name.
Deleting one task removed only that task, deleting a login cleared only the login-saved time, and deleting an app removed only that app.
These checks cannot prove a real Browser Use run or a live recording, because the Browser Use key is readable only on Vercel and the extension needs Nathan's browser.

### Ordering checks

On October 17, 2026, a throwaway script called the ordering safety rules directly.
They refused a Link connection in live mode, with no mode, with no connection, or with no status at all; a total above the spending limit; and a checkout total that differed from the approved total by one cent in either direction, and they allowed a matching total within the limit.
Checks on the branch's Vercel preview deployment then used a throwaway app: `setOrdering` rejected a $600 limit and saved a $20 limit, and the connection listed `prepare_order`, `check_order`, `place_order`, and `cancel_order` with their annotations only after the switch was on.
`prepare_order` returned the signed-out message for an app without a Browser Use profile, `place_order` and `cancel_order` rejected an unknown order ID through MCP and `/api/order`, and `check_order` reported that the Link status could not be read.
`BROWSER_USE_API_KEY` exists only in the Production environment, so the preview could not read the Link mode or start a Browser Use run, and no live prepare or place run happened.

On October 17, 2026, the production build uploaded source maps to the Sentry project `nathan-s4/mcparrot`.
A direct Node script then sent one test error and one test log with the project's DSN, and the Sentry API returned the test error by its event ID.
The available auth token cannot read organization data, so the API could not confirm the log.
That check proves the project receives events, not that the deployed app sends them.

### Production checks

On October 17, 2026, checks on mcparrot.vercel.app, including after the 9:34 PM PDT production deployment, called the Canvas app's MCP route.
`tools/list` returned all 23 Canvas tools from the production Upstash Redis, and `read_page` on the EECS 126 bCourses syllabus returned status 200 with the syllabus text through the app's Browser Use profile.
A GET request to the MCP route returned 405, and `/api/discover` returned one validated capability from Cursor Composer in about 8 seconds.
Nathan then added the app's private link to ChatGPT as a Developer mode connector and confirmed that Canvas tasks work from ChatGPT.
Production errors reached the Sentry project `nathan-s4/mcparrot`, and three of them changed the product, as the capability table describes.

## Known gaps

These gaps exist inside shipped work and stay open until a change closes them:

- The dashboard has no management MCP operations, including `delete_app`, sign-in, and the discovery operations, which breaks the [UI and MCP parity rule](README.md#ui-and-mcp-parity).
- Browser Use sign-in through **Sign in to website** needs Nathan's production demonstration.
- Automatic sign-in with a saved login and the text-message code step need Nathan's live Canvas test; the agent prompt, Duo option choice, and secret-binding hosts are untested against the real website.
- Browser Use keeps a waiting sign-in browser for 15 minutes only on paid projects; free projects stop it after 2 minutes, so a slow code entry fails and the task must start sign-in again.
- A sign-in agent run that takes longer than 150 seconds ends the tool call with an error, because Vercel stops the call at 300 seconds.
- ChatGPT first sends MCP protocol version 2026-07-28, which no MCP SDK supports; the route relies on ChatGPT falling back to version 2025-11-25, as it did in Nathan's connector test on October 17, 2026.
- Saved tasks become tools without a test, run GET requests only, and fail when a website needs header tokens instead of cookies.
- Running a task and reading a page with `read_page` work only through ChatGPT; the dashboard has no matching control.
- `read_page` lets ChatGPT read any page Nathan's account can see on the app's website, not only chosen tasks, which Nathan accepted; it only opens pages, so it changes nothing unless opening a page on that website has side effects, such as a sign-out link.
- Pages that build their content only after later user actions can return incomplete text from page-reading tasks and `read_page`.
- ChatGPT saves tasks with `save_task` without asking Nathan, which he accepted, so unwanted tasks stay until he deletes them on the app page.
- Anyone with an app's connection link can use the whole site until the bypass secret is regenerated: read the workspace and the secret, change apps, tasks, and logins, run discovery, and start a live browser on an app's signed-in profile.
- The extension and `/api/discover` redact secrets in samples and addresses only by matching patterns, such as secret-looking key names, JWTs, and long random strings, so a secret in another form can reach extension storage and Composer.
- Live recording with the extension and discovery from that recording need Nathan's production demonstration.
- The explore page's **New** and **Updates** labels, replacing a task from an update, and reopening the last discovery result need Nathan's live test; an update renamed before saving appears again in the saved result until the next run.
- The extension requires one manual unpacked installation and Chrome or Edge. It has no store listing, automatic updates, or management MCP controls.
- Sentry traces, logs, and replays from the deployed app are not yet confirmed.
- Ordering has not met a real Browser Use run, Link connection, or website; the agent instructions, the cart report, and the total check need a live test.
- Ordering places orders only in Link test mode, which Nathan chose; DoorDash has no test mode, so a DoorDash order always stops when the website declines the test-mode Link card.
- A card saved in the website account can still be charged if the agent ignores its instructions, so the user must remove saved cards from the website account before testing ordering.
- Orders do not start automatic sign-in; a signed-out app returns the signed-out message instead.
- `BROWSER_USE_API_KEY` exists only in the Production environment, so preview deployments cannot sign in, run tasks, read the Link status, or run orders.

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
| 8. Share apps | Add owner authentication, then let owners share an app with its task definitions | Another owner reuses a shared app's tasks with their own sign-in |
