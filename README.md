# MCParrot

MCParrot turns tasks you demonstrate on a website into tools your assistant can use.
You teach a task once in our app, and an assistant such as ChatGPT can then run it for you.
One website app can contain many saved tasks.
Canvas is a useful example, not a product limit.

This document is the single home for product behavior, architecture, current status, and local setup.
It is written for coding agents.
Nathan reads matching HTML guides for the [product flow](docs/index.html), the [LA Hacks 2026 hackathon](docs/hackathon.html), and [working together](docs/working-together.html).
Follow the [documentation rules](DOCUMENTATION.md) when you change any document.
See [how agents work with Nathan](WORKING_WITH_NATHAN.md) and [hackathon judging and prizes](HACKATHON.md) for those subjects.

## Contents

| Section | What it covers |
| --- | --- |
| [What the product does](#what-the-product-does) | The product goal, its two phases, and what MCP means |
| [UI and MCP parity](#ui-and-mcp-parity) | The rule that every app capability has a matching MCP operation |
| [Assistant connection architecture](#assistant-connection-architecture) | The management connection and one connection per website app |
| [Teaching website tasks](#teaching-website-tasks) | How a user creates an app and teaches it a task |
| [Headless browser experience](#headless-browser-experience) | How website browsers must run inside the product |
| [Using saved tasks](#using-saved-tasks) | How an assistant runs saved tasks and where this can fail |
| [Reconnecting expired sessions](#reconnecting-expired-sessions) | How a task continues after a website sign-in expires |
| [Production deployment setup](#production-deployment-setup) | Automatic publishing, current hosting, and future services |
| [Authentication and private data](#authentication-and-private-data) | Owner access, secrets, recordings, and diagnostics data |
| [Product work stages](#product-work-stages) | The ordered stages and their completion checks |
| [Current implementation status](#current-implementation-status) | What exists today and what is not yet connected or verified |
| [Local sign-in test](#local-sign-in-test) | The local Browser Use diagnostic and its test results |
| [Running the frontend](#running-the-frontend) | How to start the local frontend |
| [Running the task runner](#running-the-task-runner) | How to start the separate Browser Use Cloud task runner |

## What the product does

Users teach website tasks once, then request them through an assistant.
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
The current frontend has no MCP access, so it does not meet this rule yet.
The table maps each current frontend capability to its planned MCP equivalent.

| Current frontend capability | Planned management MCP equivalent | Current limit |
| --- | --- | --- |
| Browse website apps | `list_apps` | Local sample and in-memory data only |
| Open a website app | `get_app` | Local state only |
| Create a website app | `create_app` | Not persisted |
| Browse or open draft tasks | `list_tasks`, `get_task` | Local drafts only |
| Enter a task and open teaching preview | `create_task` | Preview only; no recording |
| Save a task draft | `save_draft` | Local memory only |

These operation names are examples; no MCP operations exist yet.
Future teaching, testing, publishing, connection, and recovery controls must follow the same rule when they are added.
Editing and deleting are future capabilities, not current frontend actions.
Keep an operation inventory that maps each user capability to its MCP equivalent.
For each new capability, check matching inputs, results, status, owner access, and required user actions through both interfaces.
A capability is complete only after these parity checks pass; do not accept capabilities that only one interface offers.

## Assistant connection architecture

The target design has one management connection plus one logical connection for each website app.
This design is agreed, but it is not implemented yet.

| Connection | Scope | Intended use |
| --- | --- | --- |
| MCParrot management | The signed-in user's website apps and task lifecycle | Create apps, manage tasks, start teaching, check status, and request recovery |
| One connection per website app | Only that app's verified, enabled taught tools | Execute saved website tasks |

For example, Canvas and YouTube would each have their own connection.
With management added, that user would have three connections, not one connection per task.
Management MCP support is required by the parity rule.
Users who manage apps only through the UI do not need to add the management connection, but users who manage apps through an assistant do.

These connections are separate access scopes within one hosted service, not separately deployed servers.
Example addresses are `/mcp/management` and `/mcp/apps/<app-id>`; the exact routes are not decided or implemented.
Authenticate each connection, and restrict it to the owner's authorized apps and operations.
The product supplies each address and setup instructions, and users add and authorize the connections in their compatible assistant.
Do not promise automatic connector installation or identical support across assistant clients.

Management through MCP must also start teaching sessions, return secure browser links, report status, and resume supported work.
By default the user still demonstrates each task, although an authorized agent could use the same browser session where supported.
An agent cannot replace required personal verification.
For example, Duo is a sign-in check that asks the user to approve a request on their phone, and only the user can approve it.
Keep passwords and verification codes in the secure browser or verification flow, never in assistant messages.

## Teaching website tasks

1. Open the hosted app and select **Create app**.
2. Name the website app and enter its website address.
3. Start its headless website browser session, planned through Browser Use Cloud.
4. Sign in and complete any required verification, such as Duo.
5. Select **Create task** and name the task.
6. Perform the task yourself while our recorder captures browser actions and network requests.
7. Review the proposed inputs and result, then test the task with different inputs.
8. Save the verified task and add other tasks to the same website app.
9. Connect the supplied authenticated MCP address to a compatible assistant.

Browser Use is a service that runs and controls web browsers for software.
For example, a Canvas app could contain tasks for reading assignments, checking grades, and finding course materials.
A task that lists assignments could accept a course and a date range as inputs.
Changing these inputs must not require teaching the task again.

By default, the user demonstrates the task, and Browser Use does not perform the first demonstration.
Planned MCP management access must support the same teaching steps without changing this default.
Our application must find the necessary requests and their order in the recording.
It must separate task inputs from authentication data and unrelated page traffic.
It must then produce and verify a reusable request sequence before it enables the tool.

Browser Use does not convert recordings into API requests, so our application must do this work.
We must prove request capture and reuse on a real authenticated website before we promise broad support.

## Headless browser experience

The product must always run website browsers headlessly, which means without a separate browser window on the user's computer.
This rule applies to teaching, task execution, and sign-in recovery.
Sign-in and verification use forms inside our app for supported website flows.
Browser Use enters those values into the hidden website browser without sending them to an AI model.
The teaching interaction remains unresolved; an embedded browser view is still an option.
Do not assume that forms alone can support every website or task demonstration.
Required personal verification stays in place in both UI and MCP flows.

## Using saved tasks

1. Ask the connected assistant for information or an action.
2. Let the assistant select the required saved tools and supply their inputs.
3. Receive the results without opening the website yourself.

The server checks the inputs and runs the saved API request sequence where this works.
It supplies valid session data for the correct user and website.
Browser Use handles steps that need a browser and supported recovery paths.
Direct requests are the intended normal way to run a task, rather than an agent navigating the website each time.
Measure speed against browser execution before you claim an improvement.

Assistants can combine taught tasks in new ways without another recording.
For example, an assistant could combine assignment and course-material tools to prepare a study list.
In the first version, a website action that was never taught needs another teaching session.
The first version does not discover or complete such actions automatically.

Some requests depend on browser state or short-lived tokens, and some websites block request reuse outside their browser session.
These tasks need a tested browser path, or they must stay unavailable.
The first implementation must prove a reading task before it supports tasks that change website data.

## Reconnecting expired sessions

During normal use, tasks run without another sign-in while the saved website session is valid.
Users can choose to save their credentials securely so the product can help them sign in again.
Saved credentials are optional, and users can always sign in manually instead.
When a session expires, the product follows these steps:

1. Detect the expired session and keep the pending operation.
2. Start Browser Use with the website's browser profile.
3. Continue sign-in with securely supplied credentials, if the user enabled this option.
4. Return a verification-required result when the website needs user action.
5. Show an authenticated link through the assistant for entering a code or completing browser steps.
6. Wait for the user to submit the code or approve Duo on their phone.
7. Finish sign-in, refresh session data, and resume the pending operation.

The authenticated link opens our app's verification flow.
Do not ask users to paste passwords or verification codes into assistant messages.
Store pending status so users can see whether a task needs verification, is running, or has finished.
Assistant clients differ, so do not assume every client resumes a tool call automatically after verification.
The client may need to check status or request the result again.
When an interrupted operation resumes, do not repeat a write that already finished.

School rules, device checks, and Duo settings can prevent automated sign-in.
In that case, offer manual browser control where supported, and show a clear failure when connection is not possible.
Reconnection cannot guarantee access to every website.

## Production deployment setup

The Vercel project `mcparrot` is linked to the public GitHub repository on the existing Hobby plan.
Its production branch is `main`.
Each push starts a deployment; other branches receive preview deployments.
The production build runs `npm run check` and `npm run build` before publishing.
The production dashboard is available at [mcparrot.vercel.app](https://mcparrot.vercel.app).
The first Git-triggered deployment passed its build and public HTTP checks on October 17, 2026.
The dashboard and JavaScript assets returned successfully; local sign-in and private-state paths returned 404.

Only the Next.js workspace is deployed as a website.
The local sign-in diagnostic is not a public route or hosted sign-in service.
Browser profiles, environment files, recordings, and local test state stay outside deployment and source control.
The HTML guides and design prototypes remain repository documents, outside the deployed app.

The dashboard needs no database or paid model to run today, because its changes exist only in page memory.
There is no deployed task backend, MCP endpoint, authentication service, database, or browser worker yet.
When these capabilities are built, short server operations can share the Next.js deployment.
Store durable tasks and operation status in managed PostgreSQL; Supabase or Neon are available options.
A persistent headless browser needs a separate worker host, such as Railway, or Browser Use Cloud.
Vercel requests must not own a browser session that waits for user verification.
The current local Browser Use test remains on Nathan's computer and is not reachable from the deployed dashboard.

The following table describes the planned complete product, not services already running:

| Part | Choice | Purpose |
| --- | --- | --- |
| App and server | Next.js, React, TypeScript, and Node.js on Vercel | Manage website apps, teaching, verification, and task status |
| Browser sessions | Browser Use Cloud | Host interactive browsers and support browser-dependent actions |
| Recording and task execution | Application-owned request capture and HTTP execution | Turn demonstrated tasks into verified API request sequences |
| Assistant connection | Official MCP TypeScript SDK, authenticated Streamable HTTP | Provide a remote MCP address for compatible assistants |
| Persistent storage | Hosted PostgreSQL | Store user-owned connections, task definitions, and operation status |
| Diagnostics | Sentry error monitoring, Tracing, and Logs | Find and explain failures and delays |

In the planned product, the user visits a website and does not install a Chrome extension or other local software.
Browser Use hosts the browser work, and our app shows progress and verification controls.
A Vercel request must not wait for a whole browser session to finish.
For work that takes longer than one request, store durable operation status and let clients check progress.
The exact recording interface, secure session transfer, and long-task coordination still need technical proof.

## Authentication and private data

Keep every connection, browser profile, task, and pending operation limited to its owner.
Require authentication for MCP access and verification links.
Use encrypted storage and controlled access for saved credentials, cookies, and tokens.
Keep secrets out of prompts, public task definitions, logs, traces, documentation, and source control.
Recordings can contain passwords and private website content, so record only the network data that the task needs.
Define how long recordings are kept and how they are deleted before you store captures in production.

Sentry is a service that collects errors, traces, and logs to help find problems.
Send task status, duration, and sanitized errors to Sentry.
Do not send credentials, verification codes, request bodies with private data, or student content.
Do not assume that a Browser Use profile alone gives a secure way to transfer tokens.

## Product work stages

Each stage must end with a verified demonstration.

| Stage | Work | Completion check |
| --- | --- | --- |
| 1. Prove teaching and API execution | Sign in, manually demonstrate one reading task, capture requests, and derive its inputs | Run the recorded API request with valid authentication and verify the result |
| 2. Prove MCP use | Expose that saved task through an authenticated remote MCP server | Request the task from an assistant with changed inputs |
| 3. Add Sentry | Add error monitoring, Tracing, and Logs across the complete path | Diagnose and fix a real problem using captured evidence |
| 4. Build teaching management | Add website apps, recordings, task review, and saved tools | Teach and reuse multiple tasks on one website |
| 5. Prove reconnection | Preserve an operation through session expiry and user verification | Reconnect and finish the pending task without duplicate effects |
| 6. Prove general use | Teach a task on a second website | Reuse the same product flow without a website-specific architecture |
| 7. Prepare the demo | Show teaching, assistant use, and the Sentry-backed improvement | Complete the demonstrated flow and explain its limits |

Start with one manually taught reading task, such as listing Canvas assignments.
The first stage proves that authenticated API requests can be reused, not only that a browser can navigate the website.
Interface polish and broad task support come after this proof.
For how the demo must present Browser Use and Sentry to judges, see [hackathon judging and prizes](HACKATHON.md).

## Current implementation status

The first frontend uses the Calm workspace design, with light surfaces, teal actions, and a simple website list.
It runs locally and on Vercel and lets users create website apps and draft tasks, and it shows a teaching placeholder for early feedback.
Draft tasks are not verified tools and cannot perform website actions.
The frontend is not connected to real browsers, authentication, recording, API execution, MCP, persistent storage, or Sentry.
Earlier clickable prototypes remain as comparison references; see the [prototype gallery notes](prototypes/README.md).

The local Browser Use task runner exists, but it is separate from the frontend.
The dashboard is hosted; the task and assistant services are still planned.
The separate local diagnostic verified Berkeley sign-in and session reuse after a reload.
Request capture, token transfer, and automatic reconnection remain unverified.
A syntax check does not prove that a live browser task works.

## Local sign-in test

The Berkeley-specific diagnostic uses open-source Browser Use 0.13.11 with a separate headless local Chrome profile.
It does not use Browser Use Cloud credits or an AI model.
The main frontend remains separate from this diagnostic, which does not expose MCP operations.
This experiment does not complete the UI/MCP parity requirement or change the planned hosted architecture.

Run the local test after installing Browser Use with Python 3.12 and pipx:

```sh
pipx install --python /opt/homebrew/bin/python3.12 browser-use
npm run browser:signin
```

Open [http://127.0.0.1:4321](http://127.0.0.1:4321).
Enter credentials and verification codes only in that local page, never in chat.
The test targets `https://bcourses.berkeley.edu/login/cas`; it is not a general sign-in implementation.
The server binds to loopback, checks request origin, and transfers secrets through a private process pipe.
Passwords and codes are not placed in command arguments, AI prompts, logs, or application storage.
Browser Use recordings and telemetry are disabled.
The browser keeps its session in the ignored `.local/headless-profile/` directory; do not export cookies or inspect course content.

The launcher now activates the hidden tab and sets a desktop viewport and focus.
Duo otherwise left the headless page hidden with no verification controls.
The diagnostic checks actual Duo choices, selects the SMS option for the approved phone ending in 2199 once, and displays the code form.
It skips optional persistent device trust through Duo's observed shared-device option.
Rejected entries require user correction and another explicit submission; there is no automatic credential or code retry.

The live test completed CalNet sign-in, SMS verification, and Canvas access.
Authenticated navigation markers remained present after a page reload, which verified reuse of that browser session.
The focus, SMS selection, and trust choice were first completed through operator commands and then added to the diagnostic.
A full clean rerun of those automatic steps has not been tested.
Request capture, API replay, expired-session recovery, MCP access, and Cloud compatibility remain unverified.
Keep the existing signed-in browser available; do not reset it merely to repeat this test.
See the [official Browser Use local CLI guide](https://docs.browser-use.com/open-source/browser-use-cli) for details.

## Running the frontend

Use Node.js 24 or later.
The frontend does not need a Browser Use API key.

```sh
npm install
npm run dev -- --port 4317
```

Open [http://localhost:4317](http://localhost:4317) when the development server starts.
Use this frontend to review navigation before live website connections are added.

## Running the task runner

The task runner sends one task to Browser Use Cloud.
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
