# MCParrot

MCParrot turns the website pages you explore into proposed tools your assistant can use.
You browse once, choose suggested tasks, sign in once in a Browser Use cloud browser, and connect ChatGPT to run those tasks.
One website app can contain many saved tasks.
Canvas is a useful example, not a product limit.

This document is the single home for product behavior, architecture, and local setup.
It describes the intended product and is written for coding agents.
The [status page](STATUS.md) records which parts are shipped, dormant, aspirational, or known gaps.
Nathan reads matching HTML guides for the [product flow](public/docs/index.html), the [LA Hacks 2026 hackathon](public/docs/hackathon.html), and [working together](public/docs/working-together.html).
Follow the [documentation rules](DOCUMENTATION.md) when you change any document.
See [how agents work with Nathan](WORKING_WITH_NATHAN.md) and [hackathon judging and prizes](HACKATHON.md) for those subjects.

## Contents

| Section | What it covers |
| --- | --- |
| [What the product does](#what-the-product-does) | The product goal, its two phases, and what MCP means |
| [UI and MCP parity](#ui-and-mcp-parity) | The rule that every app capability has a matching MCP operation |
| [Assistant connection architecture](#assistant-connection-architecture) | One private connection link per website app, and the later management connection |
| [Teaching website tasks](#teaching-website-tasks) | How a user explores a website, finds what it can do, and chooses tasks |
| [Discovery data sent to Composer](#discovery-data-sent-to-composer) | What discovery sends to Cursor Composer and what it never includes |
| [Browser visibility by phase](#browser-visibility-by-phase) | A visible teaching window and hidden browser work during MCP use |
| [Signing in to websites](#signing-in-to-websites) | How the user signs in once in a Browser Use cloud browser |
| [Using saved tasks](#using-saved-tasks) | How ChatGPT runs saved tasks and where this can fail |
| [Reconnecting expired sessions](#reconnecting-expired-sessions) | What happens when a website sign-in expires |
| [Production deployment setup](#production-deployment-setup) | Automatic publishing, hosting, storage, and the service architecture |
| [Authentication and private data](#authentication-and-private-data) | Owner access, the connection link secret, and recordings |
| [Diagnostics with Sentry](#diagnostics-with-sentry) | Which Sentry products MCParrot uses and which data stays out |
| [Running the frontend](#running-the-frontend) | How to start the local frontend |
| [Running the task runner](#running-the-task-runner) | How to start the dormant Browser Use Cloud task runner |

## What the product does

Users explore website pages once, review suggested tasks, then request tested tasks through an assistant.
After that, they do not need to navigate the website for each request.
The product has two separate phases: teaching a task, and using the saved task later.

MCP means Model Context Protocol.
It is a standard that lets an assistant discover and call tools from another application.
Each saved task becomes an MCP tool with defined inputs and results.
The assistant can combine saved tools to answer a new request.

## UI and MCP parity

Every user capability in the MCParrot app must have an equivalent MCP operation.
The mapping is one-to-one at the level of product operations, including reading information and managing state.
Navigation, layout, hover effects, and decorative controls do not need separate tools.
The UI and MCP must call the same underlying operations with matching inputs, permissions, results, and status.
Neither interface may bypass the other's authorization or user verification requirements.

This rule covers both managing MCParrot and running taught website tasks.
Each website app's connection runs its saved reading tasks through MCP, but no dashboard capability has a management MCP operation, which the [status page](STATUS.md) lists as a gap.
The table maps each frontend capability to its aspirational management MCP equivalent.

| Frontend capability | Aspirational management MCP equivalent |
| --- | --- |
| Browse website apps | `list_apps` |
| Open a website app | `get_app` |
| Create a website app | `create_app` |
| List an app's chosen tasks | `list_tasks` |
| Open the website and start recording | `start_exploration` |
| Stop recording | `stop_exploration` |
| List or delete recorded requests | `list_recorded_requests`, `delete_recorded_requests` |
| Find what the website can do | `discover_capabilities` |
| Save chosen capabilities as tasks | `save_tasks` |
| Sign in to the website, then finish signing in | `start_sign_in`, `finish_sign_in` |
| Copy the app's connection link | `get_connection_link` |
| Delete an app and its tasks | `delete_app` |

These operation names are examples.
Testing, publishing, and recovery controls are aspirational and must follow the same rule.
Every operation in the table is available in the UI, but none has its matching management operation yet, which is a parity gap.
Keep an operation inventory that maps each user capability to its MCP equivalent.
For each new capability, check matching inputs, results, status, owner access, and required user actions through both interfaces.
A capability is shipped only after these parity checks pass; do not accept capabilities that only one interface offers.

## Assistant connection architecture

The design has one connection for each website app plus one management connection.
Nathan scoped the first version to app connections only, so the management connection is aspirational.

| Connection | Scope | Use |
| --- | --- | --- |
| One connection per website app | Only that app's saved reading tasks | Run saved website tasks from ChatGPT |
| MCParrot management (aspirational) | The owner's website apps and task lifecycle | Create apps, manage tasks, start teaching, check status, and request recovery |

For example, Canvas and YouTube each have their own connection.
With management added, that user would have three connections, not one connection per task.
Management MCP support is required by the parity rule, and its absence is a gap.
Users who manage apps only through the UI do not need the management connection, but users who manage apps through an assistant do.

Each app connection lives at `/mcp/apps/<app-id>` in the same Next.js deployment, so the connections are access scopes within one hosted service, not separate servers.
The route uses the official MCP TypeScript SDK's Streamable HTTP transport in stateless mode, with JSON responses and no MCP sessions, which ChatGPT connectors support.
Each saved task whose requests all use GET becomes one read-only tool: the tool name comes from the task name, the description from the task description and its result, and each task input becomes an optional text parameter.
Tasks that use other methods stay off the connection, because the first version only reads website data.

Nathan chose a private connection link instead of MCP sign-in, because Vercel Authentication protects every page and ChatGPT cannot pass it.
The link is `https://mcparrot.vercel.app/mcp/apps/<app-id>?x-vercel-protection-bypass=<secret>`, where the secret is the project's Vercel Protection Bypass for Automation secret.
Vercel gives that secret to each deployment as `VERCEL_AUTOMATION_BYPASS_SECRET`, and the app page shows the full link with a **Copy link** button and setup steps.
In ChatGPT, the user opens Settings, then Apps & Connectors, then Advanced settings, turns on Developer mode, selects Create, pastes the link as the MCP server URL, and chooses No authentication.
Do not promise automatic connector installation or identical support across assistant clients.

Management through MCP must also start and stop exploration, list recorded requests, run discovery, save chosen tasks, report status, and request sign-in recovery.
An agent can start exploration, but the user browses the website in the explore tab.
An agent cannot replace required personal verification.
For example, Duo is a sign-in check that asks the user to approve a request on their phone, and only the user can approve it.
Keep passwords and verification codes in MCParrot's private verification flow, never in assistant messages.

## Teaching website tasks

Teaching has three steps for each website app: explore, discover, and choose.
One exploration can suggest several tasks, so the user does not name or record each task separately.
Canvas is a useful example, but the same flow works on any website.

1. Open the hosted app and select **Create app**.
2. Name the website app and enter its website address.
3. Select **Explore website**, install MCParrot Explorer once, then select **Open website and explore**.
4. Sign in normally in the new tab and complete any required verification, such as Duo.
5. Browse the pages and features you want the assistant to use, then select **Stop exploring** in MCParrot.
6. Select **Find what this site can do** to send the recorded requests to Cursor Composer 2.5 Fast and receive a list of capabilities.
7. Tick the capabilities to keep, edit their names and descriptions if needed, and select **Save tasks**.

Each capability shows a name, a plain description, the requests it uses as a method and URL pattern, the inputs that can change with an example, and what it returns.
Saving replaces the app's current tasks, and the app page lists them.
Select **Continue exploring** to add requests without removing earlier ones, then find capabilities again.
MCParrot stores chosen tasks with the app, and each saved reading task becomes a tool in the app's connection right away.
Testing tasks with changed inputs before they become tools remains aspirational, as the [status page](STATUS.md) records.

### Recording in the explore tab

MCParrot Explorer is an unpacked Chrome and Edge extension that records only in the tab it opens for exploration.
It attaches the browser's debugging interface to that tab, so the browser shows a bar saying that the extension is debugging the browser.
It records data requests, such as fetch and XHR requests and other JSON or XML responses, with their method, full URL, status, response content type, and a short response sample.
It skips static files such as images, fonts, style sheets, scripts, and media, and it skips common analytics hosts and sign-in, session, and token paths.
It never records request or response headers, cookies, request bodies, or authorization values, and it replaces query values whose names suggest a secret, such as a token or key.

Each sample keeps at most 80 characters per text value and 2 items per list, up to about 3 KB per response.
Requests that share a method and path pattern, with numbers and identifiers replaced by `{id}`, are stored once, up to 150 requests per app.
Recording stops when the user selects **Stop exploring**, closes the tab, dismisses the debugging bar, or restarts the browser.
Recorded requests stay in extension storage until the user deletes them, deletes the app, or removes the extension.
The extension accepts commands from the dashboard at `https://mcparrot.vercel.app`, `http://localhost:4317`, and `http://127.0.0.1:4317`.

Download the ZIP from the exploration screen, extract it, enable Developer mode on the browser extensions page, and select **Load unpacked** on the extracted folder.
To update, remove the old MCParrot Explorer from the extensions page, then load the new extracted folder the same way.
Reload MCParrot after installation.
The extension is not published in an extension store, and website policies can disable unpacked extensions.

### Limits of discovery

Composer's capabilities are suggestions inferred from one visit, not proof that a task works for this user.
Unvisited pages and actions remain unavailable unless separately explored and tested.
Some pages return HTML or use browser state rather than a separate data response; those tasks still need a tested execution path.
Saved tasks become tools without a separate test, so a tool can fail when its request cannot be reused; checking each task before it becomes a tool is aspirational.
The first milestone supports reading only, and discovery must not automatically submit changes to website data.

## Discovery data sent to Composer

Discovery sends the recorded requests, including their truncated response samples, to Cursor Composer 2.5 Fast through the Cursor SDK in the server route `/api/discover`.
The agent runs in an empty temporary folder and receives an instruction to use no tools and reply only with capabilities JSON.
Nathan chose short real-value samples because they make Composer's suggestions more accurate.
Sending private website content to the AI model is allowed; only secrets stay out of prompts.
The data leaves the browser only when the user selects **Find what this site can do**, and it contains no headers, cookies, credentials, request bodies, or sign-in traffic.
The server reads `CURSOR_API_KEY` from a Sensitive Vercel production variable or from `.env.local`; it never sends the key to the browser or writes it to logs.
Vercel Authentication protects the production site, so only Nathan can start discovery.
If the key is missing, the agent does not start, or the agent does not finish, the exploration screen shows a clear error.

## Browser visibility by phase

During teaching, also called parroting, the user browses a normal Chrome or Edge tab with the MCParrot Explorer extension.
The extension records only in the tab that the user opens through **Open website and explore**.
The user signs in normally and completes personal verification; exploration does not use a cloud browser.

Signing in for assistant use is the one step with a visible cloud browser: the user selects **Sign in to website** on the app page and signs in through Browser Use's live view in a popup.
During MCP use, the product never opens a visible website browser window.
Each tool call runs in a hidden Browser Use cloud browser that the user never sees.
For aspirational recovery flows, sign-in and verification use secure forms inside our app.
Browser Use enters those values into the hidden website browser without sending them to an AI model.
Required personal verification stays in place in both UI and MCP flows.
Unsupported recovery must return a clear failure instead of opening a visible browser during MCP use.

## Signing in to websites

Nathan chose Browser Use cloud browsers with a persistent profile for each website app, so the user signs in once and tasks reuse that sign-in.
A Browser Use profile keeps cookies, local storage, and sign-in state, and Browser Use saves it when the browser stops.
The user's normal browser and the Browser Use browser have separate sign-ins, so exploring does not sign in the cloud browser.

1. Open the app page and select **Sign in to website**.
2. MCParrot creates the app's Browser Use profile the first time, starts a cloud browser with it for up to 15 minutes, and opens the website there.
3. A popup shows the browser's live view; sign in and complete any verification, such as Duo.
4. Select **Done signing in** to stop the browser, which saves the sign-in to the profile.

MCParrot stores the profile ID and the sign-in time with the app, and the app page and app list show whether the app is signed in.
If the popup is blocked, select **Open the sign-in window** on the app page.
The server route `/api/sign-in` starts and stops these browsers with `BROWSER_USE_API_KEY`, which never reaches the browser.

## Using saved tasks

1. Ask ChatGPT, after you add the app's connection link, for information from the website.
2. ChatGPT selects the saved tools it needs and supplies their inputs.
3. Receive the results without opening the website yourself.

When ChatGPT calls a tool, the server starts a Browser Use cloud browser with the app's profile and connects to it over the Chrome DevTools Protocol with Playwright.
It opens the app's website address, fills each `{placeholder}` in the task's URL patterns from the tool inputs, and runs each request with `fetch` inside the page using the website's own cookies.
Inputs that ChatGPT leaves out use the example value that discovery found.
The tool returns each request's address, status, and response body, shortened to 20,000 characters, and the server then stops the browser.
The whole call must finish within Vercel's 60-second function limit.

The task fails with a clear message when the website is signed out: when the website address lands on a sign-in page, a request returns 401 or 403, or a request redirects to a sign-in page.
That message tells the user to open MCParrot and select **Sign in to website** on the app.
Tasks run only GET requests in this first version, because the first milestone reads website data and never changes it.

Assistants can combine taught tasks in new ways without another recording.
For example, an assistant could combine assignment and course-material tools to prepare a study list.
An unsupported action needs further discovery; a successful example does not establish support for all related actions.

Some requests depend on short-lived tokens in headers rather than cookies, and some websites block reuse of a recorded request.
Those tasks fail when they run, and they need a separate browser path or must stay unused.
Measure speed against an agent navigating the website before you claim an improvement.

## Reconnecting expired sessions

During normal use, tasks run without another sign-in while the website session is valid.
When the session expires, the tool returns an error that tells the user to select **Sign in to website** in MCParrot, and the user signs in again and repeats the request.
The automatic recovery below is aspirational.

Users can optionally save a username and password for each website app through a private form inside MCParrot.
They can replace or delete those saved details and can use manual sign-in instead.
Saved details belong to one owner, one website app, and its approved login origin.
Never reuse one app's password on another website or assume the website origin matches its separate sign-in provider.
For example, Berkeley Canvas uses its approved CalNet login origin.
The product must not capture typed passwords while exploring or import passwords from the user's normal browser.
User-managed saved logins remain aspirational, as the [status page](STATUS.md) records.
When a session expires, the product follows these steps:

1. Detect the expired session and keep the pending operation.
2. Start Browser Use with the website's browser profile.
3. Continue sign-in with securely supplied credentials, if the user enabled this option.
4. Return a verification-required result when the website needs user action.
5. Show an authenticated link through the assistant for entering credentials or a verification code inside our app.
6. Wait for the user to submit the code or approve Duo on their phone.
7. Finish sign-in, refresh session data, and resume the pending operation.

The authenticated link opens our app's verification flow.
Do not ask users to paste passwords or verification codes into assistant messages.
Store pending status so users can see whether a task needs verification, is running, or has finished.
Assistant clients differ, so do not assume every client resumes a tool call automatically after verification.
The client may need to check status or request the result again.
When an interrupted operation resumes, do not repeat a write that already finished.

The user manages saved-login status, replacement, and deletion through the same authorized operations in the UI and management MCP.
MCP operations return saved status only; they never return a stored password or accept a password through an assistant message.
An agent can request a private entry link and resume sign-in after the user completes it.
Do not retain SMS codes after submission, and do not retry rejected passwords automatically.

School rules, device checks, and Duo settings can prevent automated sign-in.
In that case, use supported in-app verification without opening a visible website browser, or show a clear failure.
Reconnection cannot guarantee access to every website.

## Production deployment setup

The Vercel project `mcparrot` is linked to the public GitHub repository on the existing Hobby plan.
Its production branch is `main`.
Each push starts a deployment; other branches receive preview deployments.
The production build runs `npm run check` and `npm run build` before publishing.
The production dashboard is available at [mcparrot.vercel.app](https://mcparrot.vercel.app).

The Next.js app deploys the workspace, the routes `/api/workspace`, `/api/discover`, `/api/sign-in`, and `/mcp/apps/<app-id>`, the Sentry forwarding route `/monitoring`, and the HTML guides at `/docs`.
Vercel Authentication protects every deployment, including the production domain; only requests that carry the automation bypass secret skip it.
Browser profiles, environment files, recordings, and local test state stay outside deployment and source control.
Next.js serves the guides as public static files from `public/`, so they must never contain secrets.

Nathan chose Upstash Redis from the Vercel Marketplace so the MCP route can read the same apps and tasks as the dashboard.
MCParrot has one owner for now, because Vercel Authentication lets only Nathan reach the dashboard, so the whole workspace is one JSON value under the Redis key `workspace`.
The value holds each app's name, website address, chosen tasks, Browser Use profile ID, and sign-in time; it holds no credentials, and recorded requests stay in the extension.
The dashboard reads the workspace through `/api/workspace` when it opens and saves the whole workspace after each change.
The first time it finds no stored workspace, it copies apps that an earlier version saved in this browser's local storage.
The Upstash integration supplies `KV_REST_API_URL` and `KV_REST_API_TOKEN`, which `@upstash/redis` reads; the dashboard shows a storage warning when they are missing.
Operation status for tasks that outlast one request remains aspirational.

The following table describes the complete product; the [status page](STATUS.md) records which parts exist:

| Part | Choice | Purpose |
| --- | --- | --- |
| App and server | Next.js, React, TypeScript, and Node.js on Vercel | Manage website apps, discovery, sign-in, and the MCP route |
| Exploration | Normal Chrome or Edge tab with MCParrot Explorer | Record data requests and short response samples in one opened tab |
| Capability discovery | Cursor Composer 2.5 Fast through the Cursor SDK in a Next.js server route | Suggest capabilities from recorded requests |
| Browser sessions | Browser Use Cloud browsers with one persistent profile per app | Keep the user's website sign-in, and run each task in a hidden browser |
| Task execution | Playwright over the Chrome DevTools Protocol, with `fetch` inside the website page | Run a task's GET requests with the website's own cookies |
| Assistant connection | Official MCP TypeScript SDK, stateless Streamable HTTP, private link with the automation bypass secret | Give ChatGPT one connection per website app |
| Persistent storage | Upstash Redis from the Vercel Marketplace | Store apps, tasks, and Browser Use profile IDs |
| Diagnostics | Sentry error monitoring, Tracing, Logs, Session Replay, and AI agent monitoring | Find and explain failures and delays |

The user installs MCParrot Explorer in Chrome or Edge once and manages exploration through the production website.
A sign-in browser runs for up to 15 minutes, but the Vercel request that starts it returns at once, and **Done signing in** stops it with a separate request.
Each task call runs inside one Vercel request with `maxDuration = 60`, so a task must finish within 60 seconds.
For work that takes longer than one request, durable operation status that clients check is aspirational.

## Authentication and private data

Keep every connection, browser profile, task, and pending operation limited to its owner.
Vercel Authentication protects the dashboard and its routes, so only Nathan can manage apps, start sign-in, or read the connection link.

The connection link is the only access control on MCP use, and Nathan accepted this trade-off for the first version.
Anyone with the link can use the whole site, not only that app's tools, because the bypass secret skips Vercel Authentication for every page.
Keep the link private, and regenerate the secret if it leaks: open the Vercel project, go to Settings, then Deployment Protection, then Protection Bypass for Automation, and regenerate it.
After a new secret, redeploy, copy each app's new link, and replace the URL in each ChatGPT connector.
MCP sign-in for each owner remains aspirational.

The Browser Use profile holds the website's cookies inside Browser Use, and MCParrot stores only its ID.
A sign-in browser's live view address works like a password while the browser runs, so MCParrot shows it only on the protected app page.
Use encrypted storage and controlled access for saved credentials, cookies, and tokens.
Before adding user-managed saved logins, provide durable encrypted storage, a separate managed encryption key, and server-enforced owner authorization for every access.
Vercel deployment access alone does not establish product ownership for each credential record.
Only the authentication worker may decrypt the selected app's password for its approved login origin; neither the UI nor MCP can read it back.
Deleting saved login details removes the credential record; ending existing website sessions is a separate action.
Keep secrets out of prompts, public task definitions, logs, traces, documentation, and source control.
Recordings must not contain passwords, cookies, or tokens, so the extension skips headers, cookies, request bodies, and sign-in traffic.
Define how long recordings are kept and how they are deleted before you store captures in production.

## Diagnostics with Sentry

Sentry is a service that collects errors, traces, logs, and session recordings to help find problems.
MCParrot uses `@sentry/nextjs` in the browser and on the server, and it sends everything to the Sentry project `nathan-s4/mcparrot`.
The SDK reads `NEXT_PUBLIC_SENTRY_DSN`, and the build uploads source maps with `SENTRY_AUTH_TOKEN`, so stack traces show the original code.
Browser events go through the same-site route `/monitoring`, which forwards them to Sentry, so ad blockers do not drop them and Vercel Authentication lets them through.
MCParrot keeps every trace and every session because it has one user, and it sends logs through the SDK instead of a Vercel Log Drain, which needs a paid Vercel plan.

| Sentry product | What MCParrot sends |
| --- | --- |
| Error monitoring | Unhandled server route errors, React render errors, and Cursor Composer failures that discovery reports to the user |
| Tracing | Each route request, with the spans `discover.composer`, `browser_use.start`, `browser_use.cdp_connect`, `browser_use.stop`, and one `task.request` for each request a task runs |
| Logs | Discovery started and finished with the request and capability counts, sign-in started and done, and each task run's outcome, including whether the website was signed out |
| Session Replay | Recordings of dashboard sessions, with all text and inputs masked |
| AI agent monitoring | The `discover.composer` span as a `gen_ai.invoke_agent` span with the model name, and one MCP span for each ChatGPT tool call, tagged with the app ID |

Spans carry only non-secret attributes, such as the app ID, task name, request count, response status, and response size.
The SDK sends no cookies, headers, request or response bodies, URL query values, stack-frame variables, user details, or AI prompts and replies.
MCP spans record tool inputs but never tool results, because the results are website responses.
Never attach credentials, cookies, tokens, verification codes, or the bypass secret to Sentry data.

## Workspace navigation behavior

App and exploration pages have stable addresses under `/apps/<app-id>` and `/apps/<app-id>/explore`.
Browser Back and Forward restore the matching workspace screen, and refreshing those addresses restores the stored apps and tasks.
The same apps appear on any device where Nathan opens the dashboard.
Select **Delete app** inside an app, then confirm inline to remove that app and its tasks from MCParrot and delete its recorded requests in the extension.
Deletion does not remove the website account.
An old link to a deleted app shows an unavailable page with a return to the app list.

## Running the frontend

Use Node.js 24 or later.
The dashboard needs `KV_REST_API_URL` and `KV_REST_API_TOKEN` in `.env.local`, which `npx vercel env pull .env.local` writes.
That command replaces the file, so add `CURSOR_API_KEY` for discovery and `BROWSER_USE_API_KEY` for sign-in and tasks again afterwards.
Add `NEXT_PUBLIC_SENTRY_DSN` to send diagnostics and `SENTRY_AUTH_TOKEN` to upload source maps during `npm run build`; without them, Sentry stays off.
The connection link appears only on Vercel, where `VERCEL_AUTOMATION_BYPASS_SECRET` exists.

```sh
npm install
npm run dev -- --port 4317
```

Open [http://localhost:4317](http://localhost:4317) when the development server starts.
Open [http://localhost:4317/docs](http://localhost:4317/docs) to read Nathan's HTML guides.
MCParrot Explorer connects to this local dashboard as well as to the production site.

## Running the task runner

The task runner sends one natural-language task to a Browser Use Cloud agent.
It is dormant: sign-in and task execution use Browser Use cloud browsers directly, not this runner.
Use Node.js 24 or later, and have a Browser Use account.

1. Install packages with `npm install`.
2. Copy `.env.example` to `.env`.
3. Get an API key from [Browser Use](https://cloud.browser-use.com/).
4. Enter the key after `BROWSER_USE_API_KEY=` in `.env`.
5. Start a task:

```sh
npm run browser -- "Open https://example.com and report its page title."
```

Each task uses your Browser Use account credits.
Keep your API key private.
Run `npm run check` to check syntax without starting a task.
See the [Browser Use quick start](https://docs.browser-use.com/cloud/quickstart) for setup instructions.
