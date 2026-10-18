# MCParrot

MCParrot turns the website pages you explore into proposed tools your assistant can use.
You browse once, review suggested tasks, and test them before an assistant such as ChatGPT can run them.
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
| [Assistant connection architecture](#assistant-connection-architecture) | The management connection and one connection per website app |
| [Teaching website tasks](#teaching-website-tasks) | How a user explores a website, finds what it can do, and chooses tasks |
| [Discovery data sent to Composer](#discovery-data-sent-to-composer) | What discovery sends to Cursor Composer and what it never includes |
| [Browser visibility by phase](#browser-visibility-by-phase) | A visible teaching window and hidden browser work during MCP use |
| [Using saved tasks](#using-saved-tasks) | How an assistant runs saved tasks and where this can fail |
| [Reconnecting expired sessions](#reconnecting-expired-sessions) | How a task continues after a website sign-in expires |
| [Production deployment setup](#production-deployment-setup) | Automatic publishing, hosting, and the target service architecture |
| [Authentication and private data](#authentication-and-private-data) | Owner access, secrets, recordings, and diagnostics data |
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
The frontend has no MCP access, which the [status page](STATUS.md) lists as a gap.
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
| Delete an app and its tasks | `delete_app` |

These operation names are examples.
Testing, publishing, connection, and recovery controls are aspirational and must follow the same rule.
Every operation in the table is available in the UI, but none has its matching management operation yet, which is a parity gap.
Keep an operation inventory that maps each user capability to its MCP equivalent.
For each new capability, check matching inputs, results, status, owner access, and required user actions through both interfaces.
A capability is shipped only after these parity checks pass; do not accept capabilities that only one interface offers.

## Assistant connection architecture

The target design has one management connection plus one logical connection for each website app.
This design is agreed and aspirational.

| Connection | Scope | Intended use |
| --- | --- | --- |
| MCParrot management | The signed-in user's website apps and task lifecycle | Create apps, manage tasks, start teaching, check status, and request recovery |
| One connection per website app | Only that app's verified, enabled taught tools | Execute saved website tasks |

For example, Canvas and YouTube would each have their own connection.
With management added, that user would have three connections, not one connection per task.
Management MCP support is required by the parity rule.
Users who manage apps only through the UI do not need to add the management connection, but users who manage apps through an assistant do.

These connections are separate access scopes within one hosted service, not separately deployed servers.
Example addresses are `/mcp/management` and `/mcp/apps/<app-id>`; the exact routes are not decided.
Authenticate each connection, and restrict it to the owner's authorized apps and operations.
The product supplies each address and setup instructions, and users add and authorize the connections in their compatible assistant.
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
Chosen tasks stay in this browser's local storage and are not assistant tools yet.
Testing tasks with changed inputs, publishing them, and serving them through MCP remain aspirational, as the [status page](STATUS.md) records.

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
The application must verify a reusable request sequence with valid authentication before it enables a task as a tool.
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

During MCP use, the product must never open a visible website browser window.
It runs direct API requests where supported and uses a hidden browser only for steps that require browser state or sign-in recovery.
For supported recovery flows, sign-in and verification use secure forms inside our app.
Browser Use enters those values into the hidden website browser without sending them to an AI model.
Required personal verification stays in place in both UI and MCP flows.
Unsupported recovery must return a clear failure instead of opening a visible browser during MCP use.

## Using saved tasks

1. Ask the connected assistant for information or an action.
2. Let the assistant select the required saved tools and supply their inputs.
3. Receive the results without opening the website yourself.

The server checks the inputs and runs the saved API request sequence where this works.
It supplies valid session data for the correct user and website.
Browser Use is reserved for this later MCP use: it signs in and passes authentication when tasks run, after the MCP server exists.
Direct requests are the intended normal way to run a task, rather than an agent navigating the website each time.
Measure speed against browser execution before you claim an improvement.

Assistants can combine taught tasks in new ways without another recording.
For example, an assistant could combine assignment and course-material tools to prepare a study list.
One discovery session may produce several proposed tasks, but only separately tested and enabled tools are available to an assistant.
An unsupported action needs further discovery and testing; a successful example does not establish support for all related actions.

Some requests depend on browser state or short-lived tokens, and some websites block request reuse outside their browser session.
These tasks need a tested browser path, or they must stay unavailable.
The first implementation must prove a reading task before it supports tasks that change website data.

## Reconnecting expired sessions

During normal use, tasks run without another sign-in while the website session is valid.
Users can optionally save a username and password for each website app through a private form inside MCParrot.
They can replace or delete those saved details and can use manual sign-in instead.
Saved details belong to one owner, one website app, and its approved login origin.
Never reuse one app's password on another website or assume the website origin matches its separate sign-in provider.
For example, Berkeley Canvas uses its approved CalNet login origin.
The product must not capture typed passwords while exploring or import passwords from the user's normal browser.
A normal-browser sign-in does not automatically sign in the separate Browser Use session.
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

The Next.js app deploys the workspace, the discovery route at `/api/discover`, and the HTML guides at `/docs`.
Vercel Authentication protects every deployment, including the production domain.
Browser profiles, environment files, recordings, and local test state stay outside deployment and source control.
Next.js serves the guides as public static files from `public/`, so they must never contain secrets.

The dashboard saves app names, website addresses, and chosen tasks in this browser’s local storage.
This supports refresh and direct app links without a database.
It does not save credentials or recorded requests there; recorded requests stay in the extension.
Durable task storage and remote MCP access remain aspirational.
Short server operations can share the Next.js deployment.
Store durable tasks and operation status in managed PostgreSQL; Supabase or Neon are available options.
Vercel requests must not own a browser session that waits for user verification.

The following table describes the complete product; the [status page](STATUS.md) records which parts exist:

| Part | Choice | Purpose |
| --- | --- | --- |
| App and server | Next.js, React, TypeScript, and Node.js on Vercel | Manage website apps, discovery, verification, and task status |
| Exploration | Normal Chrome or Edge tab with MCParrot Explorer | Record data requests and short response samples in one opened tab |
| Capability discovery | Cursor Composer 2.5 Fast through the Cursor SDK in a Next.js server route | Suggest capabilities from recorded requests |
| Browser sessions | Browser Use Cloud | Sign in and pass authentication when tasks run through MCP later |
| Task execution | Application-owned HTTP execution | Run chosen tasks as verified API request sequences |
| Assistant connection | Official MCP TypeScript SDK, authenticated Streamable HTTP | Provide a remote MCP address for compatible assistants |
| Persistent storage | Hosted PostgreSQL | Store user-owned connections, task definitions, and operation status |
| Diagnostics | Sentry error monitoring, Tracing, and Logs | Find and explain failures and delays |

The user installs MCParrot Explorer in Chrome or Edge once and manages exploration through the production website.
Browser Use later hosts sign-in and authentication during MCP use, and our app shows progress and verification controls.
A Vercel request must not wait for a whole browser session to finish.
For work that takes longer than one request, store durable operation status and let clients check progress.
Secure session transfer and long-task coordination still need technical proof.

## Authentication and private data

Keep every connection, browser profile, task, and pending operation limited to its owner.
Require authentication for MCP access and verification links.
Use encrypted storage and controlled access for saved credentials, cookies, and tokens.
Before adding user-managed saved logins, provide durable encrypted storage, a separate managed encryption key, and server-enforced owner authorization for every access.
Vercel deployment access alone does not establish product ownership for each credential record.
Only the authentication worker may decrypt the selected app's password for its approved login origin; neither the UI nor MCP can read it back.
Deleting saved login details removes the credential record; ending existing website sessions is a separate action.
Keep secrets out of prompts, public task definitions, logs, traces, documentation, and source control.
Recordings must not contain passwords, cookies, or tokens, so the extension skips headers, cookies, request bodies, and sign-in traffic.
Define how long recordings are kept and how they are deleted before you store captures in production.

Sentry is a service that collects errors, traces, and logs to help find problems.
Send task status, duration, and sanitized errors to Sentry.
Do not send credentials, cookies, tokens, or verification codes.
Do not assume that a Browser Use profile alone gives a secure way to transfer tokens.

## Workspace navigation behavior

App and exploration pages have stable addresses under `/apps/<app-id>` and `/apps/<app-id>/explore`.
Browser Back and Forward restore the matching workspace screen, and refreshing those addresses restores the apps and tasks saved in this browser.
These addresses do not transfer a browser’s saved apps to another user or device.
Select **Delete app** inside an app, then confirm inline to remove that app and its tasks from this browser and delete its recorded requests in the extension.
Deletion does not remove the website account.
An old link to a deleted app shows an unavailable page with a return to the app list.

## Running the frontend

Use Node.js 24 or later.
The frontend does not need a Browser Use API key, but discovery needs `CURSOR_API_KEY` in `.env.local`.

```sh
npm install
npm run dev -- --port 4317
```

Open [http://localhost:4317](http://localhost:4317) when the development server starts.
Open [http://localhost:4317/docs](http://localhost:4317/docs) to read Nathan's HTML guides.
MCParrot Explorer connects to this local dashboard as well as to the production site.

## Running the task runner

The task runner sends one task to Browser Use Cloud.
It is dormant and reserved for signing in and passing authentication when tasks run through MCP later.
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
