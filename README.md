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
| [Teaching website tasks](#teaching-website-tasks) | How a user creates an app and teaches it a task |
| [Browser visibility by phase](#browser-visibility-by-phase) | A visible teaching window and hidden browser work during MCP use |
| [Using saved tasks](#using-saved-tasks) | How an assistant runs saved tasks and where this can fail |
| [Reconnecting expired sessions](#reconnecting-expired-sessions) | How a task continues after a website sign-in expires |
| [Production deployment setup](#production-deployment-setup) | Automatic publishing, hosting, and the target service architecture |
| [Authentication and private data](#authentication-and-private-data) | Owner access, secrets, recordings, and diagnostics data |
| [Local sign-in test](#local-sign-in-test) | How to run the local Browser Use sign-in diagnostic and how it handles secrets |
| [Running the frontend](#running-the-frontend) | How to start the local frontend |
| [Running the task runner](#running-the-task-runner) | How to start the separate Browser Use Cloud task runner |

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
| Browse or open draft tasks | `list_tasks`, `get_task` |
| Open a website exploration | `create_teaching_session` |
| Save optional desired-action notes | `save_exploration_notes` |
| Review observed reading actions | `get_teaching_status` |
| Continue exploration without clearing captures | `resume_recording` |
| Save a task draft | `save_draft` |
| Delete an app and its drafts | `delete_app` |

These operation names are examples.
Teaching, testing, publishing, connection, and recovery controls are aspirational and must follow the same rule.
Editing remains aspirational. Deletion is available in the UI, but its matching management operation remains a parity gap.
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

Management through MCP must also start teaching sessions, return secure browser links, report status, and resume supported work.
By default the user browses the website while recording, although an authorized agent could use the same browser session where supported.
An agent cannot replace required personal verification.
For example, Duo is a sign-in check that asks the user to approve a request on their phone, and only the user can approve it.
Keep passwords and verification codes in the secure browser or verification flow, never in assistant messages.

## Teaching website tasks

The workspace starts with website exploration, without a task-name form; the [status page](STATUS.md) records the evidence and gaps.
One recording session can suggest several tasks, rather than requiring a separate demonstration for each task.

1. Open the hosted app and select **Create app**.
2. Name the website app and enter its website address.
3. Select **Explore website**, install MCParrot Explorer once, then select **Open Canvas and explore**.
4. Optionally list desired actions in plain words; these notes do not create working tasks.
5. Use your normal browser sign-in and complete any required verification, such as Duo.
6. Browse the pages you want the app to understand in the newly opened Canvas tab.
7. Select **Review suggested actions** to see all observed reading requests together.
8. Select **Continue exploring Canvas** to add observations without removing earlier captures.
9. Confirm each task's name, description, variable inputs, and expected result.
10. Test each task with changed inputs and compare its result with the website.
11. Publish only the tasks whose tests pass, then connect the supplied authenticated MCP address to a compatible assistant.

The Canvas pilot displays observed course-reading requests and syllabus navigation as candidate actions.
It labels requests by their route; it does not infer complete task meanings or prove unvisited features.
Desired-action notes stay in this browser and remain unavailable until separately discovered and tested.
The broader task review, grouping, and publication experience remains aspirational.
For example, browsing Canvas assignments and course materials can expose several reading requests in one session.
A task that lists assignments could accept a course and a date range as inputs.
The user should not need to record the same navigation again for each proposed task.
Changing a supported input must not require another recording after the changed-input test passes.
Canvas is an example; the same discovery flow applies to other websites.

A browser extension observes supported reading routes in one explicitly opened normal-browser tab.
The first pilot supports Berkeley Canvas on Chrome and Edge; it requires an unpacked extension installation, not a local server.
Download the ZIP from the hosted exploration screen, extract it, enable Developer mode on the browser extensions page, and load the extracted folder.
Reload MCParrot after installation.
The extension records allowlisted GET paths and numeric course identifiers only; it discards all query values, headers, bodies, cookies, and response content.
It does not read typed passwords or intercept authentication traffic.
Observations stay in extension storage until deleted or the extension is removed; the active recording ends when its tab closes, the browser restarts, or the user stops it.
Deleting an app asks the extension to delete its observations and stop its recording.
The extension is not published in an extension store, and website policies can disable unpacked extensions.
Browser Use is reserved for later browser-dependent execution and authentication; it does not convert observations into reusable API requests.
Normal exploration must not open a streamed cloud browser.
Earlier cloud sessions remain accessible separately without starting a new session automatically.
Candidate transfer into authenticated cloud testing remains a gap: the extension captures no reusable authentication or private response data.
The application must group observed requests into candidate tasks and separate useful requests from unrelated traffic and authentication data.
Each candidate must show the user what it reads, which inputs may change, and what result to expect.
The application must verify a reusable request sequence before it enables the task as a tool.
MCP management access must support starting discovery, reviewing candidates, testing, and publishing through the same operations as the UI.

A recorded visit does not establish support for every feature on a website.
Unvisited pages and actions remain unavailable unless separately discovered and tested.
Public website documentation may inform suggestions, but a documented or inferred request is not proof that it works for this user.
Some pages return HTML or use browser state rather than a separate JSON response; those tasks still need a tested execution path.
The first milestone supports reading only, and discovery must not automatically submit changes to website data.
We must prove capture and reuse on a real authenticated website before we promise broad support.

## Browser visibility by phase

During teaching, also called parroting, the user browses a normal Chrome or Edge tab with the MCParrot Explorer extension.
The extension observes only the selected tab and supported reading paths after explicit consent through **Open Canvas and explore**.
The user signs in normally and completes personal verification; no cloud browser stream is used for normal exploration.

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
Browser Use handles steps that need a browser and supported recovery paths.
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
User-managed saved logins remain aspirational; the current private Canvas pilot uses fixed owner credentials, as the [status page](STATUS.md) records.
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

The Next.js app deploys the workspace, and the HTML guides at `/docs`.
The local sign-in diagnostic is not a public route or hosted sign-in service.
Browser profiles, environment files, recordings, and local test state stay outside deployment and source control.
Next.js serves the guides as public static files from `public/`, so they must never contain secrets or private website content.

The dashboard saves app names, website addresses, and draft task metadata in this browser’s local storage.
This supports refresh and direct app links without a database or paid model.
It does not save credentials, request captures, website content, or teaching results there.
The authenticated hosted teaching pilot uses short server requests and a private Vercel Sandbox recorder, as described below. Durable task storage and remote MCP access remain aspirational.
Short server operations can share the Next.js deployment.
Store durable tasks and operation status in managed PostgreSQL; Supabase or Neon are available options.
Browser Use Cloud hosts website browsers, while a private Vercel Sandbox keeps request recording active between server requests.
Vercel requests must not own a browser session that waits for user verification.

The following table describes the complete product; the [status page](STATUS.md) records which parts exist:

| Part | Choice | Purpose |
| --- | --- | --- |
| App and server | Next.js, React, TypeScript, and Node.js on Vercel | Manage website apps, teaching, verification, and task status |
| Exploration | Normal Chrome or Edge tab with MCParrot Explorer | Observe supported reading routes without a streamed browser or local server |
| Browser sessions | Browser Use Cloud | Support later browser-dependent execution and authentication |
| Recording and task execution | Application-owned request capture and HTTP execution | Turn demonstrated tasks into verified API request sequences |
| Assistant connection | Official MCP TypeScript SDK, authenticated Streamable HTTP | Provide a remote MCP address for compatible assistants |
| Persistent storage | Hosted PostgreSQL | Store user-owned connections, task definitions, and operation status |
| Diagnostics | Sentry error monitoring, Tracing, and Logs | Find and explain failures and delays |

The user installs MCParrot Explorer in Chrome or Edge once and manages exploration through the production website.
Browser Use hosts later browser-dependent work, and our app shows progress and verification controls.
A Vercel request must not wait for a whole browser session to finish.
For work that takes longer than one request, store durable operation status and let clients check progress.
The exact recording interface, secure session transfer, and long-task coordination still need technical proof.

## Authentication and private data

Keep every connection, browser profile, task, and pending operation limited to its owner.
Require authentication for MCP access and verification links.
Use encrypted storage and controlled access for saved credentials, cookies, and tokens.
Before adding user-managed saved logins, provide durable encrypted storage, a separate managed encryption key, and server-enforced owner authorization for every access.
Vercel deployment access alone does not establish product ownership for each credential record.
Only the authentication worker may decrypt the selected app's password for its approved login origin; neither the UI nor MCP can read it back.
Deleting saved login details removes the credential record; ending existing website sessions is a separate action.
Keep secrets out of prompts, public task definitions, logs, traces, documentation, and source control.
Recordings can contain passwords and private website content, so record only the network data that the task needs.
Define how long recordings are kept and how they are deleted before you store captures in production.

Sentry is a service that collects errors, traces, and logs to help find problems.
Send task status, duration, and sanitized errors to Sentry.
Do not send credentials, verification codes, request bodies with private data, or student content.
Do not assume that a Browser Use profile alone gives a secure way to transfer tokens.

## Workspace navigation behavior

App, exploration, and older task pages have stable addresses under `/apps/<app-id>`, `/apps/<app-id>/explore`, and `/apps/<app-id>/tasks/<task-id>`.
Each app exploration uses a stable `explore` session key; older task sessions remain separate and accessible.
The older `/tasks/new` address opens exploration without requiring a task form.
Browser Back and Forward restore the matching workspace screen, and refreshing those addresses restores local draft metadata.
These addresses do not transfer a browser’s saved apps to another user or device.
Select **Delete app** inside an app, then confirm inline to remove that app and its drafts from this browser.
Deletion does not remove the website account or a browser profile.
An old link to a deleted app shows an unavailable page with a return to the app list.

## Hosted teaching requirement

Exploration starts from the production app and uses MCParrot Explorer in a normal browser tab.
No local server, recording worker, loopback pairing page, or streamed cloud browser is used by default.
The extension keeps sanitized observed route metadata locally; it never transfers browser cookies or website credentials to the cloud.
The separate Browser Use session needs its own authentication before a captured action can become a tested tool.
Earlier cloud exploration sessions remain available under **Earlier cloud exploration session** until they expire.
That legacy interface retains status, sign-in, reading tests, and session cleanup, but cannot start or resume recording or import extension observations.
The local teaching worker is dormant and is not linked from the product UI.
Its earlier request captures were memory-only and are unavailable after that worker stopped.
See the [status page](STATUS.md) for the remaining production proof and cloud handoff gaps.

## Local sign-in test

This diagnostic is dormant; do not start local services for the current production-only workflow.
The Berkeley-specific diagnostic uses open-source Browser Use with a separate headless local Chrome profile.
It does not use Browser Use Cloud credits or an AI model.
The main frontend remains separate from this diagnostic, which does not expose MCP operations.
This diagnostic does not satisfy the UI and MCP parity rule or change the target hosted architecture.

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

The launcher activates the hidden tab and sets a desktop viewport and focus, because Duo otherwise leaves the headless page hidden with no verification controls.
The diagnostic checks actual Duo choices, selects the SMS option for the approved phone ending in 2199 once, and displays the code form.
It skips optional persistent device trust through Duo's observed shared-device option.
Rejected entries require user correction and another explicit submission; there is no automatic credential or code retry.
The [status page](STATUS.md) records the test results.
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
Open [http://localhost:4317/docs](http://localhost:4317/docs) to read Nathan's HTML guides.
Use this frontend to review navigation and connect to the Berkeley local teaching pilot.

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

## Hosted teaching pilot

The earlier cloud exploration path is dormant for new sessions.
Existing-session controls remain for sign-in, review, reading tests, and cleanup only.
The following describes that earlier architecture, not normal extension exploration.

The production-only pilot connects a draft task to a Browser Use Cloud browser through `/api/teaching`.
Vercel Authentication protects all deployments, including the production domain, before the app can spend browser credits.
Nathan must sign in with his Vercel account to enter the private pilot.
The server reads `BROWSER_USE_API_KEY` and `MCPARROT_SESSION_SECRET` from Sensitive production environment variables.
Neither value is sent to the browser, stored in the repository, or included in request diagnostics.

A short server request starts a 30-minute Browser Use browser and a private, nonpersistent Vercel Sandbox recorder.
New exploration uses the extension and cannot create a hosted teaching browser.
An earlier session can reopen its popup, attempt private sign-in, review captured requests, run reading tests, or end the session.
The UI sends the app website address with each teaching request; the recorder stores its origin in the hosted session.
Select **Open teaching browser** to focus or reopen the same hosted session without restarting it or deleting its captures.
If the browser blocks the popup, allow popups for MCParrot and select the button again.
The recorder observes only supported same-origin GET requests and syllabus navigation for that website origin; it excludes authentication traffic and request bodies.
The pilot returns request labels and numeric course inputs, not raw headers, cookies, or course content.
Each task has one named hosted recorder; repeated connection attempts reuse the task session instead of creating another paid browser.

Secure signed HTTP-only cookies identify that draft's session after navigation or refresh in the same browser.
Captures and test summaries remain in hosted memory until the 30-minute limit, explicit session deletion, or worker failure.
They are not published tools or durable database records.
Ending a session stops the Browser Use browser and deletes its recorder; merely stopping recording keeps review and testing available.
A test obtains matching cookies privately and sends the observed GET request without navigating the teaching browser.
It reports a result count or a syllabus-page check without storing the returned course data.
The user can change the numeric course input for a second reading test.

The shared teaching operation inventory is `create_teaching_session`, `get_teaching_status`, `start_recording`, `stop_recording`, `test_saved_request`, `end_teaching_session`, `continue_signin`, and `submit_signin_code`.
The UI calls those operations; authenticated remote MCP exposure remains a parity gap and must use the same operations.
This pilot does not infer unvisited actions, publish suggested tasks, provide a multi-user credential vault, or support another school automatically.
Cloud school sign-in, live capture, and direct replay require Nathan's production demonstration before their gaps can close; see the [status page](STATUS.md).


## Private hosted sign-in

The private pilot reads `CANVAS_USERNAME` and `CANVAS_PASSWORD` from Sensitive Vercel production environment variables.
These values belong to the single protected pilot owner; they are not a general credential-storage service.
An earlier cloud session exposes **Sign in automatically** or **Check sign-in** without creating another browser.
Normal extension exploration uses the normal browser's sign-in and does not start this helper.
The authentication helper attaches to the existing Browser Use Cloud session and pauses request recording before sign-in.
It only fills credentials on `https://auth.berkeley.edu/cas/login`, after checking that the form submits to that origin.
It submits the password at most once per hosted session, and never automatically retries rejected credentials.

The helper checks actual Duo controls and selects text verification for the approved phone ending in 2199 only when offered.
It requests that text option once, opens the supported method selector when needed, and skips optional device trust.
The user enters the code into MCParrot's code form; the helper submits it once for that explicit user action.
A rejected code requires the user to enter a current code and submit again.
Unsupported school policies or verification methods require manual action in the existing teaching browser window; no phone approval is automated.
**Check sign-in** observes the current page and continues supported steps without another password attempt or text request.
After website sign-in is detected, existing captured requests remain available for reading tests.

Credentials and codes travel to the private Sandbox as AES-GCM encrypted envelopes, never as plaintext command arguments or files.
The helper decrypts them only in memory and clears its payload after the action.
It never sends these inputs to an AI model or includes them in captured requests, application responses, diagnostics, or documentation.
The helper's control key stays inside the nonpersistent hosted session and is deleted with that session.
Existing-session sign-in, SMS selection, code acceptance, and recording handoff remain a production proof gap until Nathan's live test passes.
