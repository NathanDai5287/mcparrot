# MCParrot Status

This page is the single home for the status of every MCParrot capability.
It tells coding agents what is shipped, what is dormant, what is aspirational, and which gaps are known.
The [product specification](README.md) describes how each capability behaves, and this page only records whether it exists and what proves it.
Nathan reads the same facts in plain language in the [status guide](public/docs/status.html).
Update both pages in the same change whenever a capability's status changes.

Today, MCParrot is a hosted dashboard that runs on Vercel behind Vercel Authentication.
Users sign in with Clerk, each user has their own workspace, and each app has its own secret ChatGPT link; these pass local checks but need live checks on the deployed site.
A public marketplace shares apps' tools, and on October 17, 2026, Nathan published an app to it and added that app from it on the deployed site.
Users create website apps, explore any website with MCParrot Explorer in a normal browser tab, ask Claude Opus 5.5 through Cursor to find what the site can do, and save the capabilities they choose as tools in Upstash Redis.
Each app page offers **Sign in to website** through a Browser Use cloud browser, a **Sign in again automatically** choice of off, with Google, or with an encrypted saved username and password, and a private ChatGPT connection link whose MCP route serves that app's saved tools, which can use GET and POST requests but never checkout or payment requests, a `read_page` tool for any page on its website, and a `save_task` tool that saves a useful page as a new tool.
When a tool finds the website signed out, a Browser Use agent signs in again with the saved login, where the user types any text-message code in the ChatGPT chat, or with the Google session in the app's browser profile, without any Google password.
When an app's **Ordering** switch is on, ChatGPT and the app page can prepare, check, place, and cancel orders that a Browser Use agent pays for with Pay with Link, only while Link is in test mode.
Nathan keeps ordering in test mode only, and Browser Use staff said test mode is not realistically available, so live payment stays blocked.
On October 17, 2026, the production connection read tools from the production Redis store and read a Canvas page with the app's Browser Use profile, and Nathan ran Canvas tools from ChatGPT.
Later that evening, a signed-out tool call in production signed in again by itself with the saved login and returned its result; the text-message code step and Google re-sign-in still need Nathan's demonstration.
Sentry receives errors from the deployed app, and three of them changed the product; Tracing, Logs, Session Replay, and AI agent monitoring still need confirmed events from the deployed app.
Tool testing and the management connection remain aspirational.

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
| Workspace dashboard | shipped | `app/page.tsx` creates website apps, opens exploration, and lists chosen tools beside a setup column, with a filter above 8 tools; automatic type and production build checks pass |
| App and exploration addresses | shipped | `/apps/<app-id>` and `/apps/<app-id>/explore` use browser history and Next.js rewrites; automatic type and production build checks pass; Nathan tests live navigation |
| App deletion | shipped | **Delete app** in the app page header opens a confirmation dialog that removes an app, its tools, saved login, ChatGPT link, and marketplace listing from storage and asks the extension to delete its recorded requests; automatic checks pass; management MCP parity remains a gap |
| Persistent storage in Upstash Redis | shipped | `/api/workspace` stores the workspace under one Redis key; on October 17, 2026, the production MCP route listed all 23 Canvas tools from the production Upstash Redis |
| Hosted dashboard on Vercel | shipped | The first Git-triggered deployment passed its build and public HTTP checks on October 17, 2026 |
| Vercel Authentication | shipped | On October 17, 2026, the production address redirected to Vercel sign-in before serving the app; Nathan decided to turn it off for production after accounts ship |
| HTML guides in the app | shipped | `public/docs/` returned its pages and assets from the local development server and from https://mcparrot.vercel.app/docs on October 17, 2026 |
| Explore any website | gap | MCParrot Explorer 0.5.1 records data requests with short response samples, the redacted request body of up to 30,000 characters, the request content type, and a short list of non-secret request headers of each request that is not a GET, and whole pages with a short visible-text sample in the opened tab; syntax checks pass, on October 17, 2026 its page snapshot returned the address, status 200, `text/html`, and visible text in local headless Chrome, and on October 18, 2026 a throwaway script ran its body redaction on a JSON body and a form body and replaced the password, token, and JWT values; on October 18, 2026, a throwaway script drove version 0.5.1's recording listeners with a 12.7 KB GraphQL body, kept the whole query with its `$token` declaration, redacted the JWT and an inline password, and kept only the allowed headers; Nathan must load version 0.5.1, and his live recording demonstration must pass |
| Capability discovery with Claude Opus 5.5 | shipped | On October 17, 2026, a direct Node check through the Cursor SDK, with the route's model settings, disabled tools, sandbox, and 50-second deadline, returned three or four valid JSONPlaceholder capabilities with inputs in about 9 seconds in each of two runs; the production deployment still runs the earlier model until Nathan asks for a deployment, and discovery from a live recording needs Nathan's demonstration |
| Choose and save tools | shipped | The checklist adds ticked, edited capabilities to the app's tools and skips duplicates; on October 17, 2026, a direct Node check with an in-memory Redis replacement kept a tool that `save_task` had saved after a dashboard with an older copy added tools; Nathan tests the live flow |
| Tool-aware discovery and saved results | gap | `/api/discover` sends the app's saved tools to Claude, marks each suggestion as new or as an update of a saved tool, and saves the last result under `discovery:<app-id>`; on October 17, 2026, two runs against `next dev` on a throwaway JSONPlaceholder app did not suggest the saved tool again, a third run returned an update with a real tool ID that `replaceTask` saved in place, the saved result hid saved items, and deleting the app removed its keys; Nathan's live test of the **New** and **Updates** labels on the explore page must pass |
| MCP server per website app | shipped | `/mcp/apps/<app-id>` answered initialize, listed only the GET tool as a read-only tool, returned the signed-out tool error, and returned 404 for an unknown app in a direct Node check of the route handler on October 17, 2026; a later check that day answered an initialize request for protocol version 2026-07-28 with version 2025-11-25 and listed `submit_verification_code` |
| Private ChatGPT connection link | gap | On October 17, 2026, Nathan added the Canvas app's older bypass link to ChatGPT as a Developer mode connector and ran Canvas tools from ChatGPT; each app now gets a secret token link from **Create link** or **Regenerate link**, and MCParrot stores only the token's hash; a local check that day passed the token, refused a wrong or missing token and an old token after regenerating, and accepted the older bypass link only for an owner app, as [account checks](#account-checks) describes; a live ChatGPT connector with a token link needs Vercel Authentication off and Nathan's test |
| Sign-in through Browser Use | gap | `/api/sign-in` creates the app's Browser Use profile, starts a cloud browser with its live view, and stops it on **Done signing in**; it needs Nathan's live sign-in |
| Running tools from ChatGPT | shipped | Each tool call runs the tool's GET and POST requests inside a Browser Use browser with the app's profile and returns the response, with HTML pages as visible text and up to 100,000 characters, or a signed-out error; on October 17, 2026, Nathan ran Canvas tools from ChatGPT through the production connection; POST tools have their own row |
| Reading any page from ChatGPT | shipped | Each connection's read-only `read_page` tool opens a page on the app's website with the saved sign-in and returns its text; on October 17, 2026, a production `read_page` call on the EECS 126 bCourses syllabus returned status 200 with the syllabus text through the app's Browser Use profile, and Nathan used the same connection from ChatGPT |
| Saving tools from ChatGPT | gap | Each connection's `save_task` tool adds a page-reading tool or one POST request tool to the app in Redis; on October 18, 2026, a throwaway script accepted a POST GraphQL tool and rejected a GET with a body, `cart/checkout`, a `createOrder` body, a missing body input, and a body that matched a saved tool; on October 17, 2026, a direct Node check of the route handler with an in-memory Redis replacement listed the tool, rejected another origin, a missing input, an extra input, a duplicate name, and a duplicate URL pattern, and saved a valid tool that the next tool list showed; it needs Nathan's live ChatGPT use |
| Delete one tool | shipped | Each tool on the app page has **Delete**; a direct Node check on October 17, 2026 removed only that tool through `PATCH /api/workspace`; Nathan tests the live flow; its management MCP operation remains a parity gap |
| Browser Use Cloud task runner | dormant | `browser.mjs` passes the syntax check, but no product path uses it; sign-in and tools use Browser Use cloud browsers directly |
| UI and MCP parity | gap | App connections run saved tools and read pages, but no dashboard capability has a management MCP operation, including the ordering switch and spending limit, the connection link, publishing, browsing the marketplace, and adding a marketplace app, and running a tool or reading a page has no dashboard control; ordering itself has both paths |
| Tool testing with changed inputs | aspirational | Run a chosen tool's requests with changed inputs and compare the result with the website before it appears in ChatGPT |
| Tool input derivation | aspirational | Separate tool inputs from authentication data and unrelated traffic in a tested request sequence |
| POST tools and the payment guard | gap | Discovery, `save_task`, and tool runs accept GET and POST requests with a `bodyPattern`, and one guard refuses any request that looks like checkout or payment; on October 18, 2026, a throwaway script accepted a POST GraphQL query with a body placeholder, rejected `createOrderFromCart`, `placeOrder`, `cart/checkout`, `submitPayment`, a DELETE, another origin, and mismatched placeholders, escaped quotes, a backslash, and a newline as JSON in a filled body, and refused a filled `placeOrder` address; a check in local headless Chrome against a local test server sent a POST body with its content type, did not follow a POST redirect to another origin, and returned the signed-out message when a POST redirected to a sign-in page; a live Cursor SDK discovery call on a made-up DoorDash-like recording returned one valid POST `homeLandingPageStores` tool and dropped the order mutation and a tracking pixel; no POST tool has run against a real website, so Nathan's live test must pass |
| Ordering with Pay with Link | gap | `lib/order.ts`, `/api/order`, the app page's **Ordering** section, and the connection's `prepare_order`, `check_order`, `place_order`, and `cancel_order` tools prepare a cart, show it, and pay with Pay with Link only in test mode; on October 17, 2026, a throwaway script passed the safety rules, and checks on the branch's Vercel preview passed the settings, tool list, and refusals, as [ordering checks](#ordering-checks) describes; a live Link status read, a live prepare and place run, and Nathan's DoorDash test must pass; Nathan decided to keep test mode only, and Browser Use staff said test mode is not realistically available, so live payment stays blocked and the payment step remains a gap |
| Management MCP connection | aspirational | Add MCP operations that match each dashboard capability; Nathan scoped the first version to app connections only |
| Owner authentication | gap | Clerk Google sign-in, one Redis workspace per user, the `app-owner` index, ownership checks in every route and connection, owner-only ordering, and the one-time move of the older workspace to the owner exist; on October 17, 2026, a local check with two throwaway Clerk users passed every ownership refusal and the move on a copy, as [account checks](#account-checks) describes; Nathan's Google sign-in, the real move, and checks on the deployed site must pass, and MCP sign-in remains aspirational |
| Session reconnection with a saved login | shipped | A signed-out tool starts a Browser Use agent sign-in with the saved login; on the evening of October 17, 2026, a signed-out tool call in production signed in again by itself and returned its result, as Nathan reported |
| Text-message verification code | gap | When the website asks for a text-message code, the sign-in keeps the browser, and `submit_verification_code` finishes sign-in; a direct Node check with Browser Use replaced by a stub returned the code request and stored the pending sign-in on October 17, 2026; Nathan's live Canvas test with Duo must pass |
| Google re-sign-in | gap | The **Website sign-in** card's **Sign in again automatically** choice saves off, Google with an optional account email, or email and password on the app through `setAutomaticSignIn`; with Google, a signed-out tool starts a Browser Use agent run on the app's profile with no secret bindings that selects "Continue with Google", chooses the account, and stops with `needs_user` when Google asks for anything typed; on October 17, 2026, a throwaway script with Browser Use, Redis, and storage replaced by stand-ins passed the off, Google, `needs_user`, missing-profile, and older-app paths, and a live Browser Use run on a fresh throwaway profile at medium.com stopped with `needs_user` at Google's email step without typing; Nathan's live DoorDash test must pass |
| Saved credentials | gap | **Save login**, **Replace**, and **Delete** store each app's login in Redis encrypted with AES-256-GCM under `MCPARROT_CREDENTIAL_KEY`; a direct Node check on October 17, 2026 passed the encryption round trip, rejected changed ciphertext, and saved and deleted a login through `/api/login`; `/api/login` refuses another user's app; Nathan's live save must pass |
| Long-running tool status | aspirational | Store operation status for tools that take longer than one 300-second request |
| Sentry connection and source maps | shipped | `@sentry/nextjs` starts in the browser and on the server; on October 17, 2026, the production build uploaded source maps, and a direct Node event sent with the project's DSN reached `nathan-s4/mcparrot`, where the Sentry API returned it |
| Sentry error monitoring | shipped | Server route errors, React render errors, and Claude discovery failures go to Sentry Issues; on October 17, 2026, production errors reached `nathan-s4/mcparrot`, including the MCP protocol-version probe, the signed-out message, and a Playwright `browsers.json` module error |
| Sentry Tracing | gap | Spans cover Claude discovery (`discover.agent`), Browser Use start and stop, the CDP connection, each automatic sign-in and verification code agent run with its outcome (`browser_use.agent_sign_in`, `browser_use.agent_google_sign_in`, `browser_use.agent_verification_code`), each order step with its total and outcome (`browser_use.agent_order_prepare`, `browser_use.agent_order_check_total`, `browser_use.agent_order_place`), each request a tool or `read_page` runs (`task.request`), each HTML page opened as text (`page.read`), and each `save_task` call (`task.save`); traces from the deployed app need Nathan's use |
| Sentry Logs | gap | Discovery started and finished, sign-in started and done, login saved and deleted, automatic sign-in and automatic Google sign-in started and finished, each verification code outcome, each tool run's and `read_page` call's outcome with whether the website was signed out, each tool saved from ChatGPT, and each order outcome with only the app ID, the reason, and the amounts go to Sentry Logs through the SDK, not a Vercel Log Drain; the direct Node test log was sent, but the available token cannot read logs to confirm it arrived |
| Sentry Session Replay | gap | Every dashboard session is recorded with text, inputs, and link and image addresses masked; replays need Nathan's use |
| Sentry AI agent monitoring | gap | The Claude discovery call is a `gen_ai.invoke_agent` span, and each ChatGPT tool call is an MCP span; they need Nathan's use |
| Sentry evidence that changed the product | shipped | Three production Sentry errors on October 17, 2026 changed MCParrot: the missing `playwright-core/browsers.json` led to `outputFileTracingIncludes` in `next.config.ts`, the Cursor SDK `ENOENT` under the read-only home folder led to `HOME=/tmp` in `instrumentation.ts`, and the protocol-version error led to the documented fallback and a Sentry ignore rule; the demo must show them |
| Second website support | aspirational | Teach and run a tool on a second website with the same product flow |
| Shared app marketplace | shipped | `/marketplace`, `GET /api/marketplace`, the app page's **Marketplace** section, and **Add to my apps** publish, update, unpublish, and copy an app's name, address, description, and tool definitions; on October 17, 2026, a local check published, listed without private fields, copied with new IDs, republished, and unpublished a throwaway app, as [account checks](#account-checks) describes; a later local check against throwaway workspaces confirmed that a second add and a publisher's add of their own listing return the existing app instead of a copy; on the evening of October 17, 2026, Nathan published an app to the production marketplace and added it from the marketplace, and it worked; its MCP operations remain aspirational |

A syntax check does not prove that a live browser tool works, so it never counts as evidence that a browser capability is shipped.

## Shipped work evidence

The dashboard uses the Calm workspace design, with light surfaces, teal actions, and a simple website list.
It runs locally and at [mcparrot.vercel.app](https://mcparrot.vercel.app), where it updates only when Nathan asks for a deployment from `main`.
The first Git-triggered deployment passed its build and public HTTP checks on October 17, 2026.
In that check, the dashboard and its JavaScript assets returned successfully, and the local sign-in and private-state paths returned 404.

On October 17, 2026, a direct Node check sent three JSONPlaceholder sample requests to Claude Opus 5.5 at low effort in fast mode through the Cursor SDK, as `/api/discover` does, and the reply parsed into three or four capabilities with their requests and inputs in two runs that took 9.3 and 8.6 seconds.
That check called the SDK directly from Node; it does not prove discovery on Vercel or from a live recording.

Also on October 17, 2026, a Node script called `/api/discover` and `PATCH /api/workspace` on `next dev` with the real Cursor key and storage, for a throwaway app with four JSONPlaceholder recordings.
The first run returned four capabilities; after "Read post" was saved, `GET /api/discover` returned the saved result with its time and without that tool, and the second run returned three capabilities without it.
A second app with a weak saved "List posts" tool got one update with that tool's ID, and `replaceTask` replaced it in place with the same ID; a replacement named `Read page` was skipped.
Deleting each app left none of its `discovery`, `login`, or `pending-sign-in` keys.

On October 17, 2026, a direct Node check saved a test app with one GET tool and one POST tool to a temporary Upstash database and called the MCP route handler.
The route answered initialize with the server name, listed only the GET tool as a read-only tool with its input, returned the signed-out tool error because the app had no sign-in, and returned 404 for an unknown app.
That check does not prove the production store, Browser Use sign-in, tool execution, or a live ChatGPT connector.

Later on October 17, 2026, a direct Node check called the route handlers with an in-memory Redis replacement and the real `MCPARROT_CREDENTIAL_KEY`.
An encrypted login decrypted to the same password, its ciphertext did not contain the password, and changed ciphertext was rejected.
`/api/login` saved a login with the hosts `bcourses.berkeley.edu` and `auth.berkeley.edu` without storing the password in plain text, then deleted it.
The MCP route answered an initialize request for protocol version 2026-07-28 with version 2025-11-25, listed `submit_verification_code`, returned the save-login message for a signed-out app without a login, and returned a no-pending message for a code with no waiting sign-in.
With the Browser Use API replaced by a stub, a signed-out app with a saved login created a profile, started one agent run with the password only in secret bindings and a 900-second keep-alive, stored the pending sign-in, and returned the request for a text-message code.
That check cannot prove a real Browser Use run, because the Browser Use key is readable only on Vercel.

Also on October 17, 2026, a direct Node check called the MCP route handler with an in-memory app and a local headless Chrome in place of the Browser Use browser.
The route listed `read_page` as a read-only tool, rejected an address on another origin with the allowed-website error, returned a small HTML page as its visible text without its script, style, or hidden text, returned JSON unchanged, and returned the signed-out message when the page redirected to a sign-in address.
The extension's page snapshot, run in the same kind of browser, returned the page address, status 200, `text/html`, and its visible text.
A later direct Node check that day, with an in-memory Redis replacement, called `save_task` through the route: it rejected another origin, mismatched placeholders, a duplicate name, and a duplicate URL pattern, stored a valid tool as one GET request, and the next tool list included it.
A third direct Node check that day called `PATCH /api/workspace`, the MCP route, and `/api/login` with an in-memory Redis replacement.
After `save_task` saved a syllabus tool, an `addTasks` operation from a dashboard that had loaded the workspace earlier kept that tool, added a new one, and skipped a duplicate syllabus tool with a different placeholder name.
Deleting one tool removed only that tool, deleting a login cleared only the login-saved time, and deleting an app removed only that app.
These checks cannot prove a real Browser Use run or a live recording, because the Browser Use key is readable only on Vercel and the extension needs Nathan's browser.

### Account checks

On October 17, 2026, a throwaway script ran against `next dev` with two throwaway Clerk users, a throwaway owner email, and a throwaway bypass secret, and it deleted its users and keys afterwards.
Signed out, the dashboard redirected to `/sign-in`, the marketplace page and `GET /api/marketplace` loaded, `GET /api/workspace` and marketplace writes redirected to sign-in, and a cross-site write returned 403.
The second user started with an empty workspace, created an app, could not reuse the first app's ID, and got 403 for `setOrdering` and `/api/order`.
That user got 404 for deleting the owner's tool or app, creating its link, deleting its login, and reading its discovery result, and could not publish it.
A created link stored only the token's SHA-256 hash; the MCP route answered initialize with the token, returned 401 for a wrong token, no token, an old token after regenerating, and the bypass value on the second user's app, and 404 for an unknown app.
The bypass value opened the owner's app, a wrong bypass value returned 401, and only the owner's connection listed the ordering tools after the owner turned ordering on.
Publishing listed the app with its name, tool names, publisher, and date, and without user IDs, app IDs, or token hashes; the owner's copy had new app and tool IDs, no ordering, no link, and its own owner key; republishing changed the description, and unpublishing removed the listing.
Deleting each app removed its owner key.
The move of the older workspace ran on a copy of its two apps with new IDs under a throwaway key: it moved both apps, set both owner keys, and a second run changed nothing; the real `workspace` key and the Canvas app's owner key stayed unchanged.
On the branch's Vercel preview, with a throwaway app written directly to Redis, the MCP route listed the app's tools with its token and returned 401 for a wrong or missing token and 404 for an unknown app; signed out, the marketplace page, `GET /api/marketplace`, and `/sign-in` loaded, and the dashboard and `GET /api/workspace` redirected to sign-in.

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
A GET request to the MCP route returned 405, and `/api/discover` returned one validated capability in about 8 seconds with the earlier Composer model.
Nathan then added the app's private link to ChatGPT as a Developer mode connector and confirmed that Canvas tools work from ChatGPT.
Production errors reached the Sentry project `nathan-s4/mcparrot`, and three of them changed the product, as the capability table describes.
Later that evening, Nathan reported two more production results: he published an app to the marketplace and added it from the marketplace, and a signed-out tool call signed in again by itself and returned its result.

## Known gaps

These gaps exist inside shipped work and stay open until a change closes them:

- The dashboard has no management MCP operations, including `delete_app`, sign-in, and the discovery operations, which breaks the [UI and MCP parity rule](README.md#ui-and-mcp-parity).
- Browser Use sign-in through **Sign in to website** needs Nathan's production demonstration.
- The text-message code step needs Nathan's live Canvas test; the agent's choice of the text-message option on a real Duo page is untested.
- Automatic Google sign-in has not met DoorDash or a real Google account chooser, so Nathan's live DoorDash test must show that the agent finds "Continue with Google", chooses the right account, and signs in without typing.
- Google re-sign-in works only while the Google session in the app's browser profile lasts; when Google asks the user to sign in or verify again, the tool asks the user to select **Sign in to website**.
- Browser Use keeps a waiting sign-in browser for 15 minutes only on paid projects; free projects stop it after 2 minutes, so a slow code entry fails and the tool must start sign-in again.
- A sign-in agent run that takes longer than 150 seconds ends the tool call with an error, because Vercel stops the call at 300 seconds.
- ChatGPT first sends MCP protocol version 2026-07-28, which no MCP SDK supports; the route relies on ChatGPT falling back to version 2025-11-25, as it did in Nathan's connector test on October 17, 2026.
- Saved tools appear in ChatGPT without a test and fail when a website needs a header token that is not in a readable CSRF cookie or the short list of recorded headers.
- POST tools now send a CSRF header from a readable `csrf_token`, `csrftoken`, `XSRF-TOKEN`, `_csrf`, or `csrf-token` cookie; on October 18, 2026, a throwaway headless Chrome test against a local server received the header, the allowed recorded header, and a 26 KB body, but no real website has confirmed it yet.
- MCParrot Explorer 0.5.0 cut request bodies to 2,000 characters, so its GraphQL POST tools, such as DoorDash's "List featured home stores", which returned 400 on October 18, 2026, can have a wrong query; Nathan must load version 0.5.1, explore again, find tools again, and replace those tools.
- Apollo persisted-query hashes in a request body look random, so the extension redacts them, and a website that needs them rejects the tool.
- No POST tool has run against a real website yet, and a POST tool can change data in the website account, which Nathan accepted.
- The checkout and payment guard matches words, so an order request under other names, such as `finalizeCart`, can pass it, and a harmless request that mentions a payment word is refused.
- A body placeholder fills a JSON string value, so a website that expects a number there can reject the request.
- The extension stores one request for each method and path pattern, so on a website that sends every GraphQL operation to one address, such as `/graphql`, only the first operation is recorded.
- Running a tool and reading a page with `read_page` work only through ChatGPT; the dashboard has no matching control.
- `read_page` lets ChatGPT read any page Nathan's account can see on the app's website, not only chosen tools, which Nathan accepted; it only opens pages, so it changes nothing unless opening a page on that website has side effects, such as a sign-out link.
- Pages that build their content only after later user actions can return incomplete text from page-reading tools and `read_page`.
- ChatGPT saves tools with `save_task` without asking Nathan, which he accepted, so unwanted tools stay until he deletes them on the app page.
- Anyone with an app's connection link can run that app's tools, read its website's pages with the saved sign-in, and save tools to it until the user selects **Regenerate link**.
- While Vercel Authentication protects production, the older owner links carry the bypass secret, which opens the whole site, and Vercel blocks the new token links, so token links work only after Nathan turns Vercel Authentication off.
- The owner's older apps have no owner key until Nathan opens the dashboard once after the accounts change is published, so their ChatGPT connections return 404 until then.
- Nathan chose no usage limits, so every user's discovery spends his Cursor credit and every user's sign-in and tools spend his Browser Use credit.
- A signed-out request to an `/api` route that needs sign-in redirects to the sign-in page instead of returning 401, which Clerk does in route handlers.
- The extension and `/api/discover` redact secrets in samples and addresses only by matching patterns, such as secret-looking key names, JWTs, and long random strings, so a secret in another form can reach extension storage and Claude.
- Live recording with the extension and discovery from that recording need Nathan's production demonstration.
- The explore page's **New** and **Updates** labels, replacing a tool from an update, and reopening the last discovery result need Nathan's live test; an update renamed before saving appears again in the saved result until the next run.
- The extension requires one manual unpacked installation and Chrome or Edge. It has no store listing, automatic updates, or management MCP controls.
- Sentry traces, logs, and replays from the deployed app are not yet confirmed.
- Ordering has not met a real Browser Use run, Link connection, or website; the agent instructions, the cart report, and the total check need a live test.
- Ordering places orders only in Link test mode, which Nathan chose; DoorDash has no test mode, so a DoorDash order always stops when the website declines the test-mode Link card.
- Browser Use staff said Link test mode is not realistically available, so the payment step cannot run live and stays blocked by Nathan's test-mode-only decision.
- A card saved in the website account can still be charged if the agent ignores its instructions, so the user must remove saved cards from the website account before testing ordering.
- Orders do not start automatic sign-in; a signed-out app returns the signed-out message instead.
- `BROWSER_USE_API_KEY` exists only in the Production environment, so preview deployments cannot sign in, run tools, read the Link status, or run orders.

## Aspirational work order

The product work happens in these stages, and each stage ends when its completion check passes in a demonstration.
The first stage starts with one reading tool found during a recorded browsing session, such as listing Canvas assignments.
The broader discovery experience must suggest several tools from one session and keep untested suggestions unavailable.
It must show that authenticated API requests can be reused, not only that a browser can navigate the website.
Interface polish and broad tool support come after this proof.
For how the demo must present Browser Use and Sentry to judges, see [hackathon judging and prizes](HACKATHON.md).

| Stage | Work | Completion check |
| --- | --- | --- |
| 1. Prove discovery and API execution | Explore a reading page, find capabilities, choose one tool, and sign in through Browser Use | Run the saved request in the signed-in Browser Use browser and check the result |
| 2. Prove MCP use | Add the app's connection link to ChatGPT | Request the tool from ChatGPT with changed inputs |
| 3. Use Sentry evidence | Collect errors, traces, logs, and replays from Nathan's testing | Diagnose and fix a real problem using captured evidence |
| 4. Build tool management | Add changed-input tests and publication for chosen tools | Discover several tools in one session and reuse each enabled tool |
| 5. Prove reconnection | Preserve an operation through session expiry and user verification | Reconnect and finish the pending tool without duplicate effects |
| 6. Prove general use | Teach a tool on a second website | Reuse the same product flow without a website-specific architecture |
| 7. Prepare the demo | Show teaching, assistant use, and the Sentry-backed improvement | Complete the demonstrated flow and explain its limits |
| 8. Share apps | Add owner authentication, then let owners share an app with its tool definitions | Another owner reuses a shared app's tools with their own sign-in |
