# MCParrot

MCParrot turns the website pages you explore into proposed tools your assistant can use.
You browse once, choose suggested tools, sign in once in a Browser Use cloud browser, and connect ChatGPT to run those tools.
One website app can contain many saved tools.
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
| [Teaching website tools](#teaching-website-tools) | How a user explores a website, finds what it can do, and chooses tools |
| [Discovery data sent to Claude](#discovery-data-sent-to-claude) | What discovery sends to Claude Opus 5.5 and what it never includes |
| [Browser visibility by phase](#browser-visibility-by-phase) | A visible teaching window and hidden browser work during MCP use |
| [Signing in to websites](#signing-in-to-websites) | How the user signs in once in a Browser Use cloud browser |
| [Using saved tools](#using-saved-tools) | How ChatGPT runs saved tools and where this can fail |
| [Reconnecting expired sessions](#reconnecting-expired-sessions) | What happens when a website sign-in expires |
| [Ordering with Pay with Link](#ordering-with-pay-with-link) | How ChatGPT and the app page place test-mode orders that Browser Use pays for with Stripe Link |
| [Accounts and ownership](#accounts-and-ownership) | Sign-in with Clerk, one workspace for each user, and the owner-only features |
| [Shared app marketplace](#shared-app-marketplace) | Publishing an app's tools, browsing the marketplace, and adding a shared app |
| [Production deployment setup](#production-deployment-setup) | Publishing on request, hosting, storage, and the service architecture |
| [Authentication and private data](#authentication-and-private-data) | Account access, the connection link token, saved logins, and recordings |
| [Diagnostics with Sentry](#diagnostics-with-sentry) | Which Sentry products MCParrot uses and which data stays out |
| [Workspace navigation behavior](#workspace-navigation-behavior) | Stable app addresses, Back and Forward, and deleting an app |
| [Running the frontend](#running-the-frontend) | How to start the local frontend |
| [Running the task runner](#running-the-task-runner) | How to start the dormant Browser Use Cloud task runner |

## What the product does

Users explore website pages once, review suggested tools, then request tested tools through an assistant.
After that, they do not need to navigate the website for each request.
The product has two separate phases: teaching a tool, and using the saved tool later.

MCP means Model Context Protocol.
It is a standard that lets an assistant discover and call tools from another application.
Each saved tool, whose requests all use GET or POST and pass the [checkout and payment guard](#tool-methods-and-the-payment-guard), is served as an MCP tool with defined inputs and results.
The assistant can combine saved tools to answer a new request.
Nathan chose Tools on October 17, 2026 as the name for what a user saves and ChatGPT runs.
The code, the stored data, workspace operations such as `addTasks`, and MCP tool names such as `save_task` still say task, so existing ChatGPT connections keep working.

## UI and MCP parity

Every user capability in the MCParrot app must have an equivalent MCP operation.
The mapping is one-to-one at the level of product operations, including reading information and managing state.
Navigation, layout, hover effects, and decorative controls do not need separate tools.
The UI and MCP must call the same underlying operations with matching inputs, permissions, results, and status.
Neither interface may bypass the other's authorization or user verification requirements.

This rule covers both managing MCParrot and running taught website tools.
Each website app's connection runs its saved tools and reads its pages through MCP, but no dashboard capability has a management MCP operation, which the [status page](STATUS.md) lists as a gap.
Running a tool and reading a page work only through MCP, and the dashboard has no matching control, which the status page also lists as a gap.
Reading an image has both paths: the app page's **View image** box and the app connection's `view_image` tool call the same operation, as [reading images with Claude](#reading-images-with-claude) describes.
Ordering has both paths: the app page's **Test order** box and the app connection's ordering tools call the same operations, and `check_order` reports the Pay with Link status that the app page shows.
Both paths enforce the same account rules: each operation reaches only the apps of its user, and ordering only the owner's apps, as [accounts and ownership](#accounts-and-ownership) describes.
The table maps each frontend capability to its aspirational management MCP equivalent.

| Frontend capability | Aspirational management MCP equivalent |
| --- | --- |
| Browse website apps | `list_apps` |
| Open a website app | `get_app` |
| Create a website app | `create_app` |
| List an app's chosen tools | `list_tasks` |
| Open the website and start recording | `start_exploration` |
| Stop recording | `stop_exploration` |
| List or delete recorded requests | `list_recorded_requests`, `delete_recorded_requests` |
| Find what the website can do | `discover_capabilities` |
| Open the last discovery result | `get_last_discovery` |
| Save chosen capabilities as tools | `save_tasks` |
| Replace a tool with a suggested update | `replace_task` |
| Delete one tool | `delete_task` |
| Sign in to the website, then finish signing in | `start_sign_in`, `finish_sign_in` |
| Save, replace, or delete the app's login | `get_login_status`, `request_login_entry_link`, `delete_login` |
| Choose how the app signs in again automatically | `set_automatic_sign_in` |
| Create or regenerate the app's connection link | `regenerate_connection_link` |
| Turn ordering on or off and set its spending limit | `set_ordering` |
| Publish, update, or unpublish the app on the marketplace | `publish_app`, `unpublish_app` |
| Browse the marketplace | `browse_marketplace` |
| Add a marketplace app to my apps | `install_from_marketplace` |
| Delete an app and its tools | `delete_app` |

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
| One connection per website app | That app's saved tools, and reading any page on its website | Run saved website tools and read website pages from ChatGPT |
| MCParrot management (aspirational) | The owner's website apps and tool lifecycle | Create apps, manage tools, start teaching, check status, and request recovery |

For example, Canvas and YouTube each have their own connection.
With management added, that user would have three connections, not one connection per tool.
Management MCP support is required by the parity rule, and its absence is a gap.
Users who manage apps only through the UI do not need the management connection, but users who manage apps through an assistant do.

Each app connection lives at `/mcp/apps/<app-id>` in the same Next.js deployment, so the connections are access scopes within one hosted service, not separate servers.
The route uses the official MCP TypeScript SDK's Streamable HTTP transport in stateless mode, with JSON responses and no MCP sessions, which ChatGPT connectors support.
Each saved tool whose requests all use GET or POST and pass the checkout and payment guard becomes one MCP tool: the MCP tool name comes from the saved tool's name, the description from its description and its result, and each tool input becomes an optional text parameter.
A tool whose requests all use GET has the annotation `readOnlyHint: true`, and a tool with any POST request has `readOnlyHint: false`, `destructiveHint: false`, and `openWorldHint: true`, because a POST request can change website data.
The MCP tool name is the saved tool's name in lowercase, with each run of characters other than letters and digits replaced by an underscore, leading and trailing underscores removed, and cut to 64 characters.
So names that differ only in capitalization, spaces, or punctuation, such as `Read Course` and `Read-Course`, give the same tool name `read_course`.
Each tool in a connection needs its own name, so saving rejects or skips a tool whose name gives an empty tool name, the name of a connection tool, such as `read_page`, `view_image`, `save_task`, `submit_verification_code`, `prepare_order`, `check_order`, `place_order`, or `cancel_order`, or the tool name of another tool in the app.
If stored tools still share a tool name, the connection adds the first 8 characters of the later tool's ID to its name, uses `task_` and the tool's whole ID when that name is also taken, skips the tool only when both names are taken, and writes a warning log either way.
Tools that use other methods, or with a request that the guard refuses, stay off the connection.
The route answers only POST requests; GET and DELETE return 405.
Each connection also has a `submit_verification_code` tool, which finishes an automatic sign-in, as [reconnecting expired sessions](#reconnecting-expired-sessions) describes.
When the app's **Ordering** switch is on, the connection also lists `prepare_order`, `check_order`, `place_order`, and `cancel_order`, as [ordering with Pay with Link](#ordering-with-pay-with-link) describes.

Each connection also has a read-only `read_page` tool, titled "Read a page on <app name>", whose one input `url` is a full address or a path on the app's website.
It opens that page with the app's saved sign-in in a hidden Browser Use browser and returns its text the same way a tool does, as [using saved tools](#using-saved-tools) describes, with the same length limit, signed-out check, and automatic sign-in.
It rejects any address that is not on the app's website domain, as [using saved tools](#using-saved-tools) defines, with an error that names the allowed website, before it starts a browser.
Nathan chose this tool so that ChatGPT can answer from pages that no saved tool covers, such as a syllabus link he pastes.
He accepted the trade-off that ChatGPT can read any page his account can see on that website, not only the tools he chose; it only opens pages, so it changes nothing on websites where opening a page has no side effects, but a page that changes data when it is opened, such as a sign-out link, still makes that change.

### Reading images with Claude

Each connection also has a read-only `view_image` tool, titled "Read an image on <app name>", whose one input `url` is an image address that an earlier tool answer named, such as the `src` of an `<image>` element in an Ed post.
Nathan asked for it because an Ed announcement showed a class's score mean and standard deviation only inside a picture.
ChatGPT connectors do not pass MCP image results to the model, so the tool returns text: Claude Opus 5.5 reads the picture and the tool returns Claude's copy of every text and number in it and a short description of any chart.
Its description tells ChatGPT to call it only when a picture likely holds needed information, such as a chart, a score distribution, or a screenshot, and to read one image at a time, and it says that the tool opens images on the app's website with the sign-in and `https` images on other websites without it, so images reach the chat only when they are needed.
The app page's **View image** box takes the same address, calls `/api/image`, and shows the picture with the same text.

1. MCParrot checks the address with the same website rule as `read_page`, so `static.us.edstem.org` is on the website for `https://edstem.org`.
2. It opens an address on the website as a page in a hidden Browser Use browser with the app's saved sign-in, so the website's own cookies apply, with the same signed-out check, automatic sign-in, bot-check and CSRF messages, and 30-second limit as a tool.
3. It opens an `https` address on any other website, such as Ed's image server `static.us.edusercontent.com`, as a page in a new empty browser context of that same browser, so no cookies, saved sign-in, recorded headers, or token headers go with it, and a 401 or 403 is a plain HTTP error; it refuses any other address before it starts a browser.
4. It refuses a response whose content type is not PNG, JPEG, WebP, or GIF, with a plain message.
5. Inside the page, it shrinks the picture so that its longest side is at most 1,600 pixels, draws it on white, and encodes it as JPEG; it refuses a result longer than 1,500,000 characters.
6. It sends the picture to Claude Opus 5.5 at low effort in fast mode through the Cursor SDK, the same model and settings as discovery, with tools disabled and a 60-second limit.

The instruction asks Claude to copy all text and numbers exactly, then briefly describe any chart, graph, table, or diagram, and it marks the picture as website content that Claude must never follow as instructions.
The tool result holds only Claude's text; the picture itself is not returned to MCP clients, and returning it as an MCP image block is aspirational.
MCParrot never logs or traces the picture, only its size and the length of Claude's reply.

Each connection also has a `save_task` tool, titled "Save a tool for <app name>", so the connection grows while Nathan uses ChatGPT.
Its description tells ChatGPT to call it after `read_page` returns useful content for a kind of request the user may repeat, replacing values that change with `{placeholders}`, and that MCParrot refuses checkout and payment requests.
Its inputs are `name`, `description`, an optional `method` of `GET` or `POST` that defaults to `GET`, `urlPattern`, an optional `bodyPattern` and `contentType` for POST, an optional `earlierRequests` list of up to 9 requests with the same four request fields, `inputs` as a list of name, description, and example, `returns`, and an optional `keepFields` list, as [using saved tools](#using-saved-tools) describes, which become the tool's requests in the same tool shape as a chosen tool, with the earlier requests first as steps 1, 2, and so on, and the main request last.
Its description tells ChatGPT to use earlier requests with [step placeholders](#using-saved-tools) when a request needs a value, such as a cart ID, that an earlier JSON response returns.
It rejects a URL pattern that is not on the app's website domain, a body on a GET request, a request that the checkout and payment guard refuses, a step placeholder that does not name an earlier request, placeholders other than step placeholders that do not match the inputs one to one, a name that gives an empty tool name or a connection tool's name, and a tool whose tool name or request list, ignoring placeholder names, matches an existing tool.
A saved tool appears on the app page, where **Delete** removes it, and appears in ChatGPT's next new chat; the confirmation tells ChatGPT to keep using `read_page` in the current chat.
Nathan chose that ChatGPT saves tools without asking him first, and he accepted that unwanted tools can appear until he deletes them on the app page.

Nathan chose a private connection link for each app instead of MCP sign-in.
The link is `https://mcparrot.vercel.app/mcp/apps/<app-id>?token=<token>`, where the token is 32 random bytes that MCParrot creates when the user selects **Create link** or **Regenerate link** on the app page.
MCParrot stores only the token's SHA-256 hash with the app and shows the full link once, with a **Copy link** button and setup steps, because a stored hash cannot reveal the link; a lost link means selecting **Regenerate link**.
Regenerating replaces the hash, so the old link stops working at once.
The route compares hashes in constant time and returns 401 for a missing or wrong token.
Older links in the form `?x-vercel-protection-bypass=<secret>`, where the secret is the project's `VERCEL_AUTOMATION_BYPASS_SECRET`, still work, but only for the owner's apps, so Nathan's existing ChatGPT connectors keep working.
While Vercel Authentication protects production, Vercel blocks the new token links before they reach MCParrot, so they work only after Nathan turns Vercel Authentication off; the older links work in both states.
In ChatGPT, the user opens Settings, then Plugins, selects **Browse directory**, then **Add** and **Add custom MCP server**.
The user names the plugin, pastes the link as the Server URL, sets Authentication to No authentication, accepts the risk notice, and selects **Create as a plugin**.
Workspace accounts can have custom MCP servers disabled by an administrator.
Do not promise automatic connector installation or identical support across assistant clients.

Management through MCP must also start and stop exploration, list recorded requests, run discovery, save chosen tools, report status, and request sign-in recovery.
An agent can start exploration, but the user browses the website in the explore tab.
An agent cannot replace required personal verification.
For example, Duo is a sign-in check that sends a code to the user's phone or asks the user to approve a request there, and only the user can do it.
Nathan decided that the user types website verification codes, such as a text-message code, in the ChatGPT chat.
Passwords never go into assistant messages; the user enters them only in MCParrot's **Save login** form.

## Teaching website tools

Teaching has three steps for each website app: explore, discover, and choose.
One exploration can suggest several tools, so the user does not name or record each tool separately.
Canvas is a useful example, but the same flow works on any website.

1. Open the hosted app and select **Create app**.
2. Name the website app and enter its website address.
3. Select **Explore website**, install MCParrot Explorer once, then select **Open website and explore**.
4. Sign in normally in the new tab and complete any required verification, such as Duo.
5. Browse the pages and features you want the assistant to use, then select **Stop exploring** in MCParrot.
6. Select **Find what this site can do** to send the recorded requests and the app's saved tools to Claude Opus 5.5 and receive a list of capabilities that are new or that improve a saved tool.
7. Tick the capabilities to keep, edit their names and descriptions if needed, and select the save button, which shows the number of ticked tools, such as **Save 3 tools**.

Each capability shows a name, a plain description, the requests it uses as a method, GET or POST, and URL pattern, the inputs that can change with an example, and what it returns.
Each capability is marked **New** or **Updates <tool name>**, where an update is a clearly better version of that saved tool.
Saving adds the ticked new capabilities to the app's current tools, skipping any whose name gives an unusable tool name or whose tool name or request list matches an existing tool, by the same rules as `save_task`, and the app page lists them with a **Delete** button for each.
A request matches another when its method, address, and body are the same after placeholder names are ignored, so two POST requests to one GraphQL address with different bodies are different requests.
A request list matches another when it has the same requests in the same order, so a tool "Add item to cart" that first gets the cart can sit beside a tool "Get cart" with only that request.
Saving a ticked update replaces that tool in place and keeps its ID, by the same name rules, compared with the app's other tools; an update whose tool was deleted, or whose name or request breaks those rules, is skipped.
Selecting a tool on the app page shows its inputs, its result, its **Answer fields**, which list its `keepFields` or say **All**, and each request's step number, method, URL pattern, body pattern, and token headers, such as `authorization as Bearer local storage userToken field value`, without their values, so a `{step1...}` placeholder points to a visible request.

The server keeps the last discovery result for each app, with its time, so reopening the explore page shows that list without another discovery run.
The list hides each new capability that now matches a saved tool and each update that its tool already equals, so saved items disappear after a save or reload.
An update that the user renamed before saving no longer equals its tool, so it appears again until the next discovery run.
Select **Find what this site can do** again to replace the saved result with a new run.
An app holds at most 500 tools, and the workspace holds at most 100 apps.
Select **Continue exploring** to add requests without removing earlier ones, then find capabilities again.
MCParrot stores chosen tools with the app, and each saved tool appears in the app's connection right away.
Testing tools with changed inputs before they appear in ChatGPT remains aspirational, as the [status page](STATUS.md) records.

### Recording in the explore tab

MCParrot Explorer is an unpacked Chrome and Edge extension that records only in the tab it opens for exploration.
It attaches the browser's debugging interface to that tab, so the browser shows a bar saying that the extension is debugging the browser.
It records data requests, such as fetch and XHR requests and other JSON or XML responses, with their method, full URL, status, response content type, and a short response sample.
Nathan chose to also record each whole page that loads in the tab, such as a server-rendered Canvas syllabus, because those pages never make a separate data request.
A page is recorded as a GET with its URL, status, and the content type `text/html`, marked with `kind: "page"`, and its sample is the start of the page's visible text, not its HTML.
It skips static files such as images, fonts, style sheets, scripts, and media, and it skips common analytics hosts.
It skips requests and pages only on real sign-in pages, whose path contains one of the words `login`, `logout`, `signin`, `signout`, `sign_in`, `sign_out`, `password`, `oauth`, `saml`, `sso`, `mfa`, `otp`, or `2fa`.
Words such as `auth`, `token`, `session`, `refresh`, and `verify` are not sign-in words, so it records paths such as `/api/auth/me`, `/api/v0/chat_session/create`, and `/sessions/{id}`.
For each data request that is not a GET, such as a POST GraphQL request, it also records the request body, at most 30,000 characters so that a whole GraphQL query fits, and the value of the request's `Content-Type` header as `requestContentType`.
For every data request, including a GET, it also records, as `requestHeaders`, every request header of at most 200 characters except the ones in this list:

- `cookie`, `authorization`, and any header whose name contains a secret name, such as `x-csrf-token` or `x-api-key`.
- Headers that it records as `tokenHeaders`.
- Headers whose value is a JWT or starts with `Bearer ` or `Basic `.
- Headers that the browser controls and `fetch` cannot set, such as `host`, `origin`, `referer`, `user-agent`, `content-length`, `connection`, `accept-encoding`, `cookie2`, `dnt`, every `sec-` and `proxy-` header, and HTTP/2 pseudo headers such as `:path`.
- `content-type`, because it is already recorded as `requestContentType`.

Websites such as LinkedIn, GitHub, Instacart, and Notion require headers such as `x-restli-protocol-version` or `x-notion-active-user-header` on their requests, so tools replay them.
For any request, when a request header whose name contains `auth`, `token`, `jwt`, `session`, or `apikey`, such as Ed's `x-token`, has a value that equals a value in the page's local storage, it records, as `tokenHeaders`, only the header name and the name of that local storage key, such as `{ "header": "x-token", "fromLocalStorage": "authToken" }`; it never records the value.
Before it compares, it removes a `Bearer `, `Token `, or `JWT ` scheme from the header value and records that scheme as `prefix`.
When a local storage value is JSON, it also looks for the token in its string fields up to three levels deep and records the field path as `path`, so `Authorization: Bearer abc` with `{"value":"abc"}` under `userToken` becomes `{ "header": "authorization", "fromLocalStorage": "userToken", "prefix": "Bearer ", "path": "value" }`.
It never records a cookie, an `authorization` value, a sign-in header value, or a response header.
It removes URL fragments, and it replaces with `redacted` each query value, sample value, and request body value under a secret name, and each query value or path segment that looks like a secret.
A secret name is a name that contains `token`, `secret`, `password`, `passwd`, `apikey` or `api_key`, `privatekey` or `private_key`, `cookie`, `authorization`, `csrf`, `xsrf`, `jsessionid`, or `phpsessid`, in any letter case and with any separator, so `access_token`, `refresh_token`, `id_token`, `csrfToken`, `client_secret`, `sessionToken`, and `session_token` are redacted.
Names such as `sessionId`, `session_id`, `sessionid`, `sid`, `auth`, `code`, `sig`, and `key` are not secret names, so their values stay.
A value looks like a secret only when it is a JWT or starts with `Bearer ` or `Basic `; long or random-looking values, such as UUIDs, file IDs, order IDs, and GraphQL persisted-query `sha256Hash` values, stay.
Text samples and request bodies also lose JWTs, `Bearer` values, and values after secret names such as `password=` or `api_key:`.
A JSON request body keeps its whole structure, such as a GraphQL query, and only loses its secret values; it is not shortened like a response sample.
In a GraphQL `query` text, both the extension and `/api/discover` redact only quoted values after secret names, such as `password: "…"`, JWTs, and `Bearer` values, so variable declarations such as `$token: String` stay intact.
Both the extension and `/api/discover` use the same secret names and the same secret value shapes.
This redaction matches patterns, so a secret in another form, such as a short code or a value under an ordinary key, can still appear in a sample or a request body.
Nathan chose these recording and redaction rules on October 18, 2026, because AI tools may see any website content, while saved tools never hold cookie, `authorization`, or token header values because tools can be shared on the marketplace.

Each sample keeps at most 400 characters per text value and 5 items per list, up to about 12 KB per response, and a response that is not JSON keeps its first 1,600 characters.
A page sample keeps the first 8,000 characters of its visible text, with spaces collapsed.
Requests and pages that share a method and path pattern, with numbers and identifiers replaced by `{id}`, are stored once, up to 150 requests per app.
Recording stops when the user selects **Stop exploring**, closes the tab, dismisses the debugging bar, or restarts the browser.
Recorded requests stay in extension storage until the user deletes them, deletes the app, or removes the extension, and when the dashboard next contacts the extension, it deletes each recording whose last request is 30 or more days old, except the one that is recording.
The extension, version 0.8.0, asks only for the `storage`, `unlimitedStorage`, and `debugger` permissions and no host permissions; `unlimitedStorage` lets recordings of several apps with longer samples go past the browser's 10 MB storage limit.
The extension accepts commands from the dashboard at `https://mcparrot.vercel.app`, `http://localhost:4317`, and `http://127.0.0.1:4317`.

Download the ZIP from the exploration screen, extract it, enable Developer mode on the browser extensions page, and select **Load unpacked** on the extracted folder.
To update, remove the old MCParrot Explorer from the extensions page, then load the new extracted folder the same way.
Version 0.4.0 does not record request bodies, and version 0.5.0 cuts each body to 2,000 characters, which cuts off most GraphQL queries, so a POST tool found from those recordings can fail until the user loads version 0.6.0, explores again, and finds tools again.
Versions before 0.6.0 do not record `tokenHeaders`, so tools on a website that signs requests with a header, such as Ed, need a new recording with version 0.6.0 and a new discovery run.
Versions before 0.6.1 do not record `requestHeaders` for GET requests, so a GET tool on a website that requires one of those headers, such as LinkedIn, needs a new recording with version 0.6.1 and a new discovery run.
Versions before 0.7.0 skip paths with the word `session` and record no `tokenHeaders` for a `Bearer` value or a token inside JSON, so such websites need a new recording with version 0.7.0 and a new discovery run.
Versions before 0.8.0 record only a short list of request headers, redact session IDs and random-looking values such as persisted-query hashes, skip paths with words such as `auth` or `token`, and keep shorter samples, so tools found from those recordings can miss headers or values until the user loads version 0.8.0, explores again, and finds tools again.
Reload MCParrot after installation.
The extension is not published in an extension store, and website policies can disable unpacked extensions.

### Limits of discovery

Claude's capabilities are suggestions inferred from one visit, not proof that a tool works for this user.
Unvisited pages and actions remain unavailable unless separately explored and tested.
Discovery can suggest page-reading tools, such as "Read course syllabus" with a `{courseId}` input, from recorded pages.
Pages that build their content only after later user actions, rather than when they load, can still return incomplete text.
Saved tools appear in ChatGPT without a separate test, so a tool can fail when its request cannot be reused; checking each tool before it appears in ChatGPT is aspirational.
Discovery can suggest POST requests, including GraphQL mutations, but never one that the [checkout and payment guard](#tool-methods-and-the-payment-guard) refuses, and discovery itself never sends any request to the website.
A placeholder in a body sits inside a JSON string value, so a website that expects a number there, such as a latitude, can reject the filled body.

## Discovery data sent to Claude

Discovery sends the recorded requests and pages, including their truncated samples, to Claude Opus 5.5 at low effort in fast mode, with a 300k context, through the Cursor SDK in the server route `/api/discover`.
Nathan chose this model for discovery on October 17, 2026.
The dashboard sends only the app ID and the recordings; the server reads the app's website address and saved tools from storage and adds each tool's ID, name, description, requests, inputs, returns, and `keepFields` to the recorded data.
The agent runs with its tools disabled by configuration, in an empty temporary folder, and inside the SDK's sandbox; when the server does not support the sandbox, it runs again without it.
The server deletes the temporary folders after each run and stops waiting after 50 seconds with a timeout error.
The instruction asks for capabilities JSON only, explains that page requests return the page's text, and asks for page-reading tools where a page's text is useful, in the same capability shape as data tools.
It tells Claude that tools can use GET and POST requests, to prefer GraphQL queries for reading, that other POST requests and mutations are allowed except checkout and payment, and to ignore analytics, tracking, and advertising requests, such as third-party pixels.
A POST request in a capability has a `bodyPattern`, the request body as a string with `{placeholders}` inside JSON string values, and a `contentType`.
The instruction tells Claude to copy each body exactly, with the whole GraphQL query text, and never to shorten, rewrite, or invent query text.
It explains step placeholders and tells Claude to use one, with the earlier request first, when a recorded request contains a value that also appears in an earlier recorded response sample.
It asks Claude for `keepFields` when a tool's last request returns JSON: the paths in that response that a person needs for the tool's purpose, such as names, titles, text, dates, scores, prices, and IDs that other tools take as inputs, chosen from the recorded samples and written like `threads[].title` or `data.store.menu[].items[].price`, and empty for page-reading tools.
The server drops empty paths from the reply and keeps at most 50.
After Claude replies, the server copies the recorded `requestHeaders` of the recorded request with the same method and path into each GET or POST request as `headers`, after it removes the headers that the extension never records, and the recorded `tokenHeaders` of any recorded request on the same host into each request on that host as `tokenHeaders`; Claude never sees them.
It asks Claude to skip anything a saved tool already does and to suggest a change to a saved tool only when it clearly improves that tool, including `keepFields` for a saved tool that has none while its last response is recorded, with the tool's ID as `updatesTaskId`.
It marks the recorded data, including the saved tools, as untrusted website content that Claude must never follow as instructions.
The dashboard sends the newest recorded requests that fit in 3.9 MB and leaves out the oldest ones, because Vercel refuses function request bodies larger than 4.5 MB.
The route accepts at most 4 MB and 150 requests, cuts each sample to 12,000 characters, each request body to 30,000 characters, and each request content type to 200, and sends a request body to Claude only for requests on the app's website domain and only until the bodies reach 300,000 characters in total.
Before it builds the prompt, it redacts URL credentials, fragments, query values under secret names, values under secret names in samples and request bodies, JWTs, `Bearer` values, and values after labels such as `password:` again, then shortens every sample to at most 450,000 characters divided by the number of requests, such as 3,000 characters for 150 requests, so the prompt stays inside Claude's context.
It keeps at most 50 replied capabilities, and only those whose requests all use GET or POST on the app's website domain, have no body on a GET, pass the checkout and payment guard, whose step placeholders name only earlier requests, and whose other placeholders in URL patterns and bodies match their inputs one to one.
It treats a capability whose `updatesTaskId` is not a saved tool of that app as new, and it drops new capabilities whose tool name or request list matches a saved tool, and updates that equal their tool.
After a successful run, it saves the result and its time under `discovery:<app-id>`, and `GET /api/discover?appId=<app-id>` returns that result with the same filtering against the current tools.
When nothing is new or better, the result is an empty list, unless the app has no saved tools, which stays an error.
Nathan chose real-value samples because they make Claude's suggestions more accurate, and on October 18, 2026, he chose longer samples so that Claude sees more of each response.
Sending private website content to the AI model is allowed, including pictures that `view_image` and **View image** send to Claude; only secrets stay out of prompts.
Nathan allowed `view_image` and **View image**, and only them, to open `https` pictures on any website, because websites such as Ed keep pictures on a separate image server; those pictures open without the user's sign-in, so the other website receives the browser's address and the picture address but no cookies or tokens.
The data leaves the browser only when the user selects **Find what this site can do**, and it contains no cookies, no `authorization` values, no sign-in header values, and no sign-in pages, and Claude never sees request headers, although a secret that neither the extension's nor the server's patterns match can still reach Claude in a sample or a request body.
The server reads `CURSOR_API_KEY` from a Sensitive Vercel production variable or from `.env.local`; it never sends the key to the browser or writes it to logs.
Only a signed-in user can start discovery, and only on their own apps; every user's discovery runs on Nathan's Cursor key, which the [status page](STATUS.md) lists as a risk.
If the key is missing, the agent does not start, or the agent does not finish, the exploration screen shows a clear error.

## Browser visibility by phase

During teaching, also called parroting, the user browses a normal Chrome or Edge tab with the MCParrot Explorer extension.
The extension records only in the tab that the user opens through **Open website and explore**.
The user signs in normally and completes personal verification; exploration does not use a cloud browser.

Signing in for assistant use is the one step with a visible cloud browser: the user selects **Sign in to website** on the app page and signs in through Browser Use's live view in a popup.
During MCP use, the product never opens a visible website browser window.
Each tool call runs in a hidden Browser Use cloud browser that the user never sees.
When a tool call finds the website signed out, a hidden Browser Use agent signs in again with the app's saved login.
Browser Use types the password into the website page without sending it to the agent's AI model.
Required personal verification stays in place in both UI and MCP flows.
Unsupported recovery returns a clear failure instead of opening a visible browser during MCP use.

## Signing in to websites

Nathan chose Browser Use cloud browsers with a persistent profile for each website app, so the user signs in once and tools reuse that sign-in.
A Browser Use profile keeps cookies, local storage, and sign-in state, and Browser Use saves it when the browser stops.
The user's normal browser and the Browser Use browser have separate sign-ins, so exploring does not sign in the cloud browser.

1. Open the app page and select **Sign in to website**.
2. MCParrot creates the app's Browser Use profile the first time, starts a cloud browser with it for up to 15 minutes, and opens the website there.
3. A popup shows the browser's live view; sign in and complete any verification, such as Duo.
4. Select **Done signing in** to stop the browser, which saves the sign-in to the profile.

MCParrot stores the profile ID and the sign-in time with the app, and the app page and app list show whether the app is signed in.
If the popup is blocked, select **Open the sign-in window** on the app page.
The server route `/api/sign-in` starts and stops these browsers with `BROWSER_USE_API_KEY`, which never reaches the browser.
The user can also choose on the app page how MCParrot signs in again by itself when the website signs out, with Google or with a saved login, as [reconnecting expired sessions](#reconnecting-expired-sessions) describes.

## Using saved tools

1. Ask ChatGPT, after you add the app's connection link, for information from the website.
2. ChatGPT selects the saved tools it needs and supplies their inputs.
3. Receive the results without opening the website yourself.

When ChatGPT calls a tool, the server reuses the app's warm Browser Use cloud browser or starts one with the app's profile, connects to it over the Chrome DevTools Protocol with Playwright, and opens a new tab for this call.
Each warm browser runs for at most 10 minutes, and MCParrot stores its ID and connection address in Redis under `warm-browser:<app-id>` for its first 7 minutes, so a reused browser always has at least 3 minutes left; later calls in that window skip starting a browser and reuse the browser's cache.
Calls at the same time share the warm browser through separate tabs, a call closes its tab and disconnects when it finishes, and a failed connection starts a new browser that replaces the stored one.
Browser Use saves a profile when its browser stops, and when two browsers share a profile, the one that stops last overwrites the profile, so sign-in, automatic sign-in, each verification code, preparing an order, and deleting the app stop the warm browser before their own browser starts, and each sign-in also stops it again before its own browser saves the new sign-in.
It opens the origin of the app's website address, such as `https://bcourses.berkeley.edu`, fills each `{placeholder}` in the tool's URL patterns and body patterns from the tool inputs, and runs each request with `fetch` inside the page with its method, its body, and the website's own cookies.
URL values are URL-encoded, and body values are escaped as JSON string content, or URL-encoded when the content type is `application/x-www-form-urlencoded`, so a quote or `&` in an input cannot change the body's structure.
A request with a body sends its recorded content type, or `application/json` when none was recorded.
A POST request never follows a redirect, so its body cannot reach another origin; after a redirected POST, the browser opens the website's origin again and treats the website as signed out when that lands on a sign-in page, and otherwise returns an error.
Inputs that ChatGPT leaves out use the example value that discovery found.
A tool's requests run in order, and a later request can use a value from an earlier request's JSON response through a step placeholder `{stepN.path.to.value}`, where `N` is the earlier request's position in the tool, starting at 1, and each dot-separated part is a key or an array position, such as `{step1.data.cart.id}` or `{step2.items.0.id}`.
For example, a DoorDash tool "Add item to cart" can get the cart in its first request and send `{step1.data.cart.id}` in its second.
A step placeholder is not a tool input, and it is filled and encoded the same way as an input, with a non-text value, such as a number or an object, written as JSON.
When the earlier response is not JSON, is longer than 100,000 characters, or has no value at that path, the tool stops with an error that names the step and the path.
When a GET response's content type is HTML, the browser opens that address as a page, waits for it to load, then waits up to 5 seconds for its network requests to stop and 2 more seconds when its visible text is shorter than 200 characters, so pages that JavaScript builds return their text, and uses the page's visible text instead of the raw HTML; other responses, such as JSON or any POST response, stay as they are.
The tool returns each request's address, status, and compacted response text, and the browser stays warm for the next call.
The browser reads up to 100,000 characters of each response, and step placeholders use that raw text, but the text sent back is compacted without AI so that ChatGPT reads it faster.
A JSON response loses `null` values, empty strings, empty arrays and objects, `__typename` keys, and keys whose names contain `tracking` (except package tracking keys such as `trackingNumber`, `trackingUrl`, or `trackingStatus`), `analytics`, `telemetry`, `experiment`, or `logging`, and text values of 80 or more characters made only of letters, digits, and `_-.=+/` that do not start with `/`, such as JWTs, Canvas `secure_params`, and base64 page cursors, and it is written without indentation; addresses keep their `:`, and paths start with `/`, so both stay.
Any text with HTML or XML markup, such as an Ed post's `<document><paragraph>` content or a whole response that is not JSON, becomes plain text with its tags removed, its entities decoded, and its spaces collapsed, and each `<img src>` or `<image src>` becomes `[image: address]`.
A list of 3 or more objects whose keys mostly match, with at least 60% of the cells filled, becomes a table inside its brackets: one line of key names and one line for each item, with values separated by ` | `, `|` and line breaks in values written as `\|` and `\n`, and nested objects one level deep written as dotted keys such as `user.name`; when some, but not all, keys have the same value in every item, the table starts with one `every row: key=value; key=value` line for them, and the key names and item lines hold only the other keys; a list whose items hold lists of objects stays JSON, so the inner lists become tables.
When a tool has `keepFields`, the last request's JSON response keeps only those paths, in the same structure, before compaction, where each dot separates keys and `[]` means every array element, and a path that leaves out `[]` still reads every element; earlier requests and step placeholders still use their full responses.
When no path matches, the answer is the whole compacted response.
Every saved tool has an optional `fullAnswer` input, which ChatGPT is told to use only when the short answer lacks something it needs; it skips the field filter, and compaction still applies.
A JSON text value longer than 2,000 characters ends with `… [N more characters]`, and a compacted response longer than 20,000 characters is cut to that limit: when the limit falls inside a table, the answer ends after the last whole line with `[showing N of M rows; the rest were cut. fullAnswer will not show more. Ask the user to narrow the request.]`, and otherwise it ends with `[answer shortened: N more characters were cut. fullAnswer will not show more. Ask the user to narrow the request.]`, because `fullAnswer` only skips the field filter and is cut at the same limit.
Each request and page read, including these waits, has a 30-second limit, a status of 400 or more other than 401 and 403 returns an error with the address and status, and a redirect or page that leaves the app's website domain returns an error instead of its text.
An address counts as on the app's website domain when it uses the same protocol and port as the website and its host is the website's host or any host under the same registrable domain, so `https://open.spotify.com` accepts `api-partner.spotify.com` and `spotify.com`, and `https://edstem.org` accepts `us.edstem.org`.
MCParrot finds the registrable domain with the public suffix list, including private suffixes, so `www.bbc.co.uk` accepts `news.bbc.co.uk` but not `other.co.uk`, and `mcparrot.vercel.app` does not accept `other.vercel.app`.
Discovery, tool runs, `save_task`, `read_page`, and the signed-in path of `view_image` all use this website rule, which Nathan chose on October 18, 2026, because websites such as Spotify serve their data from a sibling host.
A request with `tokenHeaders` reads each named local storage key inside the website's page when it runs and sends its value under the header name, such as Ed's `x-token` from `authToken`; with a `path`, it parses the stored JSON and reads that field, and it puts any `prefix`, such as `Bearer `, before the value; the value never leaves the page, so it never reaches the server, the tool result, logs, or Sentry.
A request to another host runs from the website's page as a cross-origin `fetch`; it sends no cookies when it sends a token header, because websites such as Ed allow any origin but refuse cross-origin requests with cookies, and otherwise it includes cookies, so it works only when that host allows it.
Nathan chose the 20,000-character limit after compaction because long answers slowed ChatGPT down; on a made-up Ed thread of 44,947 characters, compaction removed 31% before that limit, and on a made-up DoorDash GraphQL response of 79,219 characters, it removed 64%.
On October 18, 2026, tables cut a made-up 30-thread Ed list from 9,301 to 5,735 GPT tokens and a made-up DoorDash home feed from 8,362 to 5,515 tokens, both counted before the limit, and `keepFields` for each tool's purpose cut them to 1,896 and 2,227 tokens.
Later that day, writing same-in-every-row values once cut a made-up list of 25 Canvas assignments from 10,380 to 7,873 GPT tokens before the limit, so all 25 assignments fit in the answer instead of 19, and a made-up DoorDash home feed of 40 stores from 9,664 to 9,196 tokens.
Dropping the long opaque values then cut them to 4,339 and 5,991 tokens, so the whole DoorDash feed also fit.
A made-up list of 400 Ed threads now ends after row 355 with `[showing 355 of 400 rows; …]` instead of in the middle of a row.
The whole call must finish within the route's 300-second Vercel function limit.

The tool treats the website as signed out when that origin lands on a sign-in page, a request or opened page redirects to a sign-in page, or a request or opened page returns 401 or 403 that is not one of the two cases below.
A 401 or 403 with a `cf-mitigated` header or a bot-check page, such as Cloudflare's "Just a moment", a captcha, "Prove your humanity", Kasada, or Akamai, fails with a message that the website blocked the automated browser.
A 401 or 403 whose text says that a CSRF or forgery check failed or that the authenticity token is invalid fails with a message that the website refused the request's protection code and that the user must record that page again with MCParrot Explorer.
These messages never include the response text, and neither case starts an automatic sign-in.
When the app signs in again automatically, MCParrot then signs in by itself, as [reconnecting expired sessions](#reconnecting-expired-sessions) describes.
Otherwise, the tool fails with a message that tells the user to open MCParrot and select **Sign in to website** on the app or choose how it signs in again automatically.

Assistants can combine taught tools in new ways without another recording.
For example, an assistant could combine assignment and course-material tools to prepare a study list.
An unsupported action needs further discovery; a successful example does not establish support for all related actions.

Some requests depend on header tokens that are not in local storage as a plain value or a JSON field, such as a token kept only in memory or in session storage, and some websites block reuse of a recorded request.
Those tools fail when they run, and they need a separate browser path or must stay unused.
Measure speed against an agent navigating the website before you claim an improvement.

### Tool methods and the payment guard

Nathan decided on October 17, 2026, that tools may use GET and POST requests, not only GET, because many websites, such as DoorDash, read and act through POST GraphQL requests to addresses such as `/graphql/<operation>` with JSON bodies.
He accepted the risk that a POST tool can change data in his website account.
MCParrot keeps exactly one guard on tool requests: it refuses any request whose URL path or body looks like checkout or payment.
For a GraphQL body, it checks only the operation name of a query, so a query that selects fields such as `paymentMethod` or `purchases` passes, and it checks the operation name and the whole document of a mutation.
The guard decodes URL encoding until nothing changes, splits names such as `placeOrder` into words, and refuses the words checkout, check out, payment, pay, purchase, place order, create order, submit order, and order create, so `cart/checkout`, `order/create`, and `createOrderFromCart` are all refused.
Discovery, `save_task`, the connection's tool list, and every tool run apply the guard, and a run checks the request again after it fills the inputs.
The guard exists so that a tool cannot place a real order with a card saved on a website, and ordering stays only in the [Pay with Link flow](#ordering-with-pay-with-link).
The guard matches words, so an order request under other names, such as `finalizeCart`, can still pass it, and a harmless request whose address, non-GraphQL body, or GraphQL operation name contains one of the words, such as a query named `paymentHistory`, is refused.
`read_page` only opens pages with GET, so the guard does not apply to it.
A GET or POST tool sends its saved `headers`, after it removes again the headers that the extension never records, and a POST tool also adds a fresh anti-forgery (CSRF) token as `x-csrftoken`, `x-csrf-token`, and `x-xsrf-token`, because many websites refuse a request without that header.
A GET request to a path that ends in `/graphql` or `/api/graphql`, as Canvas uses, adds the same token, and other GET requests do not.
Before the requests, the run opens the website's home page in the signed-in browser and reads the token from the first of `meta[name=csrf-token]`, `meta[name=csrf_token]`, `meta[name=_csrf]`, `input[name=csrfmiddlewaretoken]`, and `input[name=authenticity_token]`, or else from the URL-decoded value of the first readable cookie whose name contains `csrf` or `xsrf` in any case, such as Canvas's `_csrf_token`.
When the page has `meta[name=_csrf_header]`, the run also sends the token under the header name in that tag.
When a readable `JSESSIONID` cookie, without its surrounding quotes, starts with `ajax:`, as on LinkedIn, every request, GET included, sends that value as `csrf-token`.
The value never leaves the website's page, and MCParrot never logs it.

## Reconnecting expired sessions

During normal use, tools run without another sign-in while the website session is valid.
When the session expires, MCParrot can sign in again by itself during the ChatGPT tool call, in the way the app's **Sign in again automatically** choice says.
The choice is **Off**, **With Google**, or **With email and password**, and the user picks it on the app page.
With email and password, the user only types a text-message code in the ChatGPT chat when the website asks for one.
When the choice is off, or email and password has no saved login, the tool returns an error that tells the user to select **Sign in to website** in MCParrot or choose how the app signs in again.
Signing in again with a saved login is shipped, while the text-message code step and Google re-sign-in are gaps until Nathan's live tests pass, as the [status page](STATUS.md) records.

### Choosing how to sign in again

The app page has one **Website sign-in** card.
Its main button is **Sign in to website**, which opens the live cloud browser, and below the sign-in status it has the **Sign in again automatically** choice.
Selecting a choice saves it on the app at once through the workspace `setAutomaticSignIn` operation, and a failed save puts the earlier choice back.
**With Google** shows an optional **Google account email** field, which only tells the agent which account to choose and is not a secret; MCParrot accepts only a valid email address there.
**With email and password** shows the saved-login form, or **Replace** and **Delete** when a login is saved.
A note under the choice says that email and password works only on a normal sign-in form, not with "Continue with Google".
An app saved before this choice existed counts as **With email and password** when it has a saved login, and as **Off** when it has none.

### Signing in again with Google

Nathan decided on October 17, 2026, that sites such as DoorDash, where the user selects "Continue with Google", sign in again through the Google session in the app's cloud browser profile.
MCParrot never stores or types a Google password.
When the user signs in through **Sign in to website** with Google, the app's profile keeps both the website session and the Google session.
When a tool then finds the website signed out and the app's choice is **With Google**, MCParrot starts a Browser Use agent run on the app's profile with no secret bindings.
The agent opens the website and its sign-in page, selects "Continue with Google" or "Sign in with Google", and chooses the account that matches the saved Google email, or the only account shown when there is no email.
The agent never types on a Google page, and it stops with the outcome `needs_user` when Google asks for an email, a password, a code, or to verify that it is the user, or when the account is not shown.
Then the tool tells the user to open MCParrot and select **Sign in to website** on the app, then try again.
When the agent signs in, MCParrot stops the browser so the profile saves the session, records the sign-in time, and runs the original tool again in the same call when at least 60 seconds of the call's budget remain.
An app with no browser profile gets the same message without an agent run.
The Google way uses the same one-at-a-time lock, the 150-second agent limit, and the 10-minute pause after a failure as the email and password way, and the pause ends early when the user changes the Google email.

### Saving a login

When **With email and password** is chosen, the **Website sign-in** card shows a **Save login** form that takes the username and password for that website.
After saving, the page shows only **Login saved**, with **Replace** to enter new details and **Delete** to remove them.
Saving takes the website address from the stored app, not from the form, and finds the website's sign-in address by following that address's redirect, so Berkeley Canvas logins are allowed on `bcourses.berkeley.edu` and its CalNet sign-in page `auth.berkeley.edu`.
Browser Use may type the saved details only on those two hosts, so one app's password never reaches another website.
The product never captures typed passwords while exploring and never imports passwords from the user's normal browser.
Deleting the app also deletes its saved login and any pending sign-in, but deleting a login does not sign out existing website sessions.

### Automatic sign-in steps

1. A tool call finds the website signed out, the app's choice is **With email and password**, and the app has a saved login.
2. MCParrot starts a Browser Use agent run with the app's browser profile, creating the profile first if the app has none.
3. The agent receives the username and password as Browser Use secret bindings, which the Browser Use server types into the page; the agent's AI model never sees them.
4. The agent submits the password once; when the website rejects it, MCParrot tells the user to replace the login and never submits that login again until the user replaces it.
5. When the website asks for verification, the agent chooses the text-message option, opening "Other options" in Duo when needed, and stops when the page asks for the code.
6. MCParrot keeps that browser running for 15 minutes and stores its session ID, browser ID, and CDP address in Redis as the app's pending sign-in, which expires with it.
7. The tool result tells ChatGPT that a code was sent to the user's phone and to ask the user for it, then call `submit_verification_code`.
8. That tool reads the page's host names over CDP and starts a follow-up agent run in the same browser, which receives the code as a secret binding for those hosts, submits it, and skips optional device trust.
9. When sign-in finishes, MCParrot stops the browser so the profile saves the session, clears the pending sign-in, and records the sign-in time.
10. The tool tells ChatGPT that sign-in finished and to run the original tool again; it does not rerun the tool itself.

When the website signs in without verification, the tool continues in the same tool call if at least 60 seconds of the call's 280-second budget remain; otherwise the tool tells ChatGPT to run the original tool again.
When the website rejects the code, the tool asks ChatGPT to request a new code from the user and keeps the browser waiting.
When a tool runs while a sign-in waits for a code, it repeats the request for the code instead of starting another sign-in.
After the user changes the choice away from **With email and password**, tools and `submit_verification_code` ignore a sign-in that waits for a code, and it expires with its browser.
Only one sign-in runs at a time for each app; another call during it tells ChatGPT to wait a minute and try again.
Any other outcome stops the browser and tells the user to select **Sign in to website** in MCParrot, and MCParrot does not try the same login again for 10 minutes.
MCParrot does not keep the code after the call, and Sentry never receives it.

The saved-login operations follow the parity rule: MCP operations may return saved status only and never return a stored password or accept one through an assistant message.
Those management MCP operations remain aspirational, as the [UI and MCP parity section](#ui-and-mcp-parity) records.
School rules, device checks, and Duo settings can prevent automated sign-in, and reconnection cannot guarantee access to every website.

## Ordering with Pay with Link

Nathan decided that ChatGPT and the dashboard can place food and shopping orders through a Browser Use agent that pays with Browser Use's built-in Pay with Link, which uses Stripe Link.
Link issues a one-time card for each payment that the user approves, so MCParrot stores no card number or security code.
DoorDash is the first live target, and Nathan's hard requirement is that ordering must never charge his real card.
So MCParrot places an order only while the Link connection is in test mode, as [payment safety rules](#payment-safety-rules) describes.
Ordering runs through Browser Use agent runs, not through saved tools, which the [checkout and payment guard](#tool-methods-and-the-payment-guard) keeps away from checkout and payment.
This ordering path is a gap until a live check passes, as the [status page](STATUS.md) records.

### Ordering settings

Each of the owner's app pages has an **Ordering** section with an **Allow ordering from ChatGPT and from this page** switch, which is off by default, and a spending limit for each order in US dollars.
Nathan decided that only the owner can turn on and use ordering, because orders use his Browser Use account and its Link connection.
Other users do not see the section, and the server refuses `setOrdering`, `/api/order`, and the ordering tools for them.
The limit can be at most $500, because Link refuses larger payments.
The `setOrdering` workspace operation stores both with the app.
The section also shows whether Pay with Link is connected and whether its mode is test or live, and live mode shows that it is blocked.
The app's connection lists the four ordering tools only while the switch is on and the app belongs to the owner.

### Order steps

1. The user asks ChatGPT to order something, or types the request in the app page's **Test order** box and selects **Prepare order**.
2. `prepare_order` starts a Browser Use agent run with the app's browser profile; the agent builds the cart, opens the checkout page, and stops without selecting any place-order or pay button. The tool returns at once with an order ID.
3. `check_order`, or the app page every 5 seconds, reads the run; when it finishes, the result lists the items, subtotal, fees, tip, total, delivery address, and delivery estimate.
4. ChatGPT shows the cart and asks the user to approve the exact total, and the app page shows the cart with **Place order for $total** and **Cancel order**.
5. `place_order` checks the safety rules, then runs a short agent step in the same browser that reads the checkout total again without paying, and compares it with the approved total.
6. When every rule passes, MCParrot starts the payment run with the Link connection, and Link asks the user to approve the payment in the Link app on their phone.
7. `check_order` reports the website's confirmation or why the payment failed, and MCParrot stops the browser.

`cancel_order`, or **Cancel order**, cancels the agent run and stops its browser, but the cart can stay in the website account.
Only one order runs at a time for each app; preparing another order while one is preparing, ready, or placing returns a message to check or cancel it first.
The order record lives in Redis under `pending-order:<app-id>` for one hour after its last change, and the browser stays open for 30 minutes after each run so that the user has time to approve.
Browser Use keeps the browser for only 2 minutes on free projects, so the total check then opens the checkout again in a new browser.
Each order's Browser Use session may spend at most $5 of Browser Use credit.
The app needs a Browser Use profile from **Sign in to website**; without one, or when the agent finds a sign-in page, the order fails with the signed-out message, because automatic sign-in does not run for orders.

### Payment safety rules

The server enforces these rules in code, not only in the agent's instructions.

- MCParrot reads the Link connection from Browser Use's `GET /api/v4/stripe-link` before the total check and again just before payment, and it places the order only when the mode is `test`. A `live` mode, a missing mode or connection, or a failed status read refuses the order with a clear message. Nathan chose test mode only, and no setting overrides it in this version.
- Only the payment run receives the Link connection ID, so the prepare and total-check runs cannot pay with Link.
- MCParrot refuses when the total is above the app's spending limit.
- MCParrot refuses when the checkout total read just before payment differs from the approved total by one cent or more. It keeps the new cart, so the user can approve the new total and place the order again.

Every ordering run's instructions tell the agent to pay only with the card that Pay with Link issues and never with a payment method saved on the website.
The prepare and total-check runs also tell the agent never to select a place-order, pay, or submit button, and the payment run tells it to stop without paying when the total is not the approved total.
Link itself also asks the user to approve each payment.

### Ordering limits and risks

Test mode means that a payment can succeed only on a website that accepts Stripe test cards.
DoorDash has no test mode, so on DoorDash the payment step cannot succeed: the website declines the test-mode Link card, and the order fails with that message.
A card saved in the website account is a risk that the code cannot fully block, because only the agent's instructions keep the agent from choosing it.
The user must remove every saved card from the website account before testing.
When a payment run fails for another reason, the order may still have gone through, so the message tells the user to check the website's order history before trying again.

## Accounts and ownership

Nathan decided that MCParrot has real accounts, so other people can use it with their own apps.
Users sign in with Google through Clerk, which Nathan installed from the Vercel Marketplace; the `/sign-in` page shows Clerk's sign-in box, and the sidebar has an account button to sign out.
The dashboard and every `/api` route need a signed-in user, except the marketplace page and its read route, and `/docs`, `/monitoring`, `/sign-in`, and the app connections at `/mcp/apps/<app-id>` are public; each connection checks its own token.
Each page and route checks the session itself, because Clerk deprecates path matching in middleware, and `proxy.ts` runs Clerk's middleware and still rejects cross-site `/api` writes.
A signed-out visit to the dashboard, or to an `/api` route that needs sign-in, redirects to `/sign-in`, which returns to the page afterwards.

Each user has one workspace under the Redis key `workspace:<user-id>`, and the key `app-owner:<app-id>` records which user owns each app.
Every route and connection finds the app's owner from that key, and each route checks that the owner is the signed-in user before it reads or changes any per-app key; another user's app returns 404.
Creating an app sets its owner key in the same atomic step as the workspace change and fails when the key already exists, and deleting an app removes the key in the same way.

The owner is the account whose verified primary email matches `MCPARROT_OWNER_EMAIL`.
The first time the owner opens the dashboard, MCParrot moves the older single `workspace` value to `workspace:<owner-id>` and writes an owner key for each of its apps, in one atomic Redis step that runs only while the older value exists, so it runs once.
Until then, the older apps have no owner key and their connections return 404, so Nathan must open the dashboard once right after this change is published.
Only the owner can turn on and use ordering.
Nathan chose no usage limits for other users, so every user's discovery spends his Cursor credit and every sign-in and tool spends his Browser Use credit, which the [status page](STATUS.md) lists as a risk.

## Shared app marketplace

Nathan decided that users can share an app's tools on a public marketplace at `/marketplace`, which anyone can open without signing in.
It lists each published app's name, website address, short description, tool count and tool names, publisher name, and published date, newest first.
`GET /api/marketplace` returns the same summaries without signing in.

1. On the app page, select **Publish to marketplace** in the **Marketplace** section.
2. Write a short description of up to 500 characters, and read the preview of exactly what will be shared.
3. Select **Publish** to confirm.

The listing holds the app name, website address, description, the publisher's name from their Clerk account, and each tool's name, description, requests, inputs, returns, and `keepFields`.
When ordering is on for the app, the listing says only "Supports ordering", and copies always start with ordering off.
A listing never holds logins, Browser Use profile IDs, sign-in times, connection tokens, recordings, discovery results, or orders.
After publishing, the section shows the published date with **Update listing**, which publishes the app's current tools and description again under the same listing, and **Unpublish**, which removes the listing; deleting the app also removes it.

Each marketplace item has **Add to my apps**, which copies it into the signed-in user's workspace as a new app with new app and tool IDs, ordering off, no sign-in, and no connection link, then opens that app.
For a listing that the signed-in user published or already added, the item shows **In your apps** with **Open** instead, and a repeated add returns status 409 with "This app is already in your apps." and the existing app ID, so it never makes a copy.
Copies added before this check have no source listing ID, so the marketplace does not recognize them.
A signed-out visitor sees **Sign in to add**, which opens the sign-in page and then returns to the marketplace.
Redis keeps the listing IDs in the set `marketplace` and each listing under `listing:<listing-id>`, the published app keeps its listing ID, published date, and description, and an added app keeps its source listing ID in `installedFrom`.
The server validates each listing with zod and refuses an app with more than 100 tools, a listing longer than 200,000 characters, and a new listing when the marketplace holds 200.
Matching marketplace MCP operations are aspirational, as the [UI and MCP parity section](#ui-and-mcp-parity) records.

## Production deployment setup

The Vercel project `mcparrot` is linked to the public GitHub repository on the Pro plan.
Its production branch is `main`.
Pushes do not start deployments, because Nathan chose to publish only when he asks, so `vercel.json` turns off Git deployments.
To publish, run `npx vercel deploy --prod` from an up-to-date `main` checkout.
The production build runs `npm run check` and `npm run build` before publishing.
The production dashboard is available at [mcparrot.vercel.app](https://mcparrot.vercel.app).

The Next.js app deploys the workspace, the pages `/marketplace` and `/sign-in`, the routes `/api/workspace`, `/api/discover`, `/api/sign-in`, `/api/login`, `/api/order`, `/api/connection`, `/api/marketplace`, `/api/image`, and `/mcp/apps/<app-id>`, the Sentry forwarding route `/monitoring`, and the HTML guides at `/docs`.
Vercel Authentication still protects every deployment, including the production domain, and only requests that carry the automation bypass secret skip it.
Nathan decided to turn Vercel Authentication off for production once accounts ship, so that other people can reach the Clerk sign-in.
Browser profiles, environment files, recordings, and local test state stay outside deployment and source control.
Next.js serves the guides as public static files from `public/`, so they must never contain secrets.

Nathan chose Upstash Redis from the Vercel Marketplace so the MCP route can read the same apps and tools as the dashboard.
Each user's workspace is one JSON value under `workspace:<user-id>`, as [accounts and ownership](#accounts-and-ownership) describes.
The value holds each app's name, website address, chosen tools, Browser Use profile ID, sign-in time, login-saved time, automatic sign-in choice with any Google account email, ordering setting, connection token hash, and listing details; it holds no credentials, and recorded requests stay in the extension.
Each saved login is a separate encrypted value under `login:<app-id>`, so the dashboard never reads it, each pending sign-in is a value under `pending-sign-in:<app-id>` that expires after 15 minutes, and each order is a value under `pending-order:<app-id>` that expires one hour after its last change.
Each app's last discovery result is a separate value under `discovery:<app-id>`.
The dashboard reads the workspace through `/api/workspace` when it opens, and it never writes the whole workspace back.
Each dashboard change is one small operation sent to `PATCH /api/workspace`: create an app, delete an app, add chosen tools, replace one tool, delete one tool, or set the app's ordering.
The server reads the current workspace from Redis, changes only that app or tool, and writes it back in one atomic Redis step only if no other change arrived in between, retrying otherwise; it then returns the updated apps, which the dashboard shows.
Deleting an app removes its saved login, pending sign-in, last discovery result, and order in that same step, stops the pending sign-in browser, and cancels the order's agent run and stops its browser.
`/api/sign-in` stores the app's profile ID and sign-in time, and `/api/login` stores or clears its login-saved time, in the same way.
So a tool that ChatGPT saves with `save_task` stays when an older open dashboard makes a change, and it appears there after the next change or reload.
The Upstash integration supplies `KV_REST_API_URL` and `KV_REST_API_TOKEN`, which `@upstash/redis` reads; the dashboard shows a storage warning when they are missing.
Operation status for tools that outlast one request remains aspirational.

The following table describes the complete product; the [status page](STATUS.md) records which parts exist:

| Part | Choice | Purpose |
| --- | --- | --- |
| App and server | Next.js, React, TypeScript, and Node.js on Vercel | Manage website apps, discovery, sign-in, and the MCP route |
| Exploration | Normal Chrome or Edge tab with MCParrot Explorer | Record pages, data requests, and short samples in one opened tab |
| Capability discovery | Claude Opus 5.5 at low effort in fast mode through the Cursor SDK in a Next.js server route | Suggest capabilities from recorded requests |
| Browser sessions | Browser Use Cloud browsers with one persistent profile per app, and Browser Use agent runs with secret bindings | Keep the user's website sign-in, run each tool in a hidden browser, and sign in again with the saved login or the profile's Google session |
| Tool execution | Playwright over the Chrome DevTools Protocol, with `fetch` inside the website page | Run a tool's GET and POST requests or `read_page` with the website's own cookies, and turn HTML pages into their visible text |
| Assistant connection | Official MCP TypeScript SDK, stateless Streamable HTTP, private link with a secret token for each app | Give ChatGPT one connection per website app |
| Accounts | Clerk from the Vercel Marketplace, with Google sign-in | Give each user their own workspace and identify the owner |
| Persistent storage | Upstash Redis from the Vercel Marketplace | Store each user's apps and tools, owner keys, Browser Use profile IDs, encrypted saved logins, pending sign-ins, last discovery results, and marketplace listings |
| Diagnostics | Sentry error monitoring, Tracing, Logs, Session Replay, and AI agent monitoring | Find and explain failures and delays |

The user installs MCParrot Explorer in Chrome or Edge once and manages exploration through the production website.
A sign-in browser runs for up to 15 minutes, but the Vercel request that starts it returns at once, and **Done signing in** stops it with a separate request.
Each MCP tool call runs inside one Vercel request with `maxDuration = 300`, so it has at most 300 seconds.
MCParrot waits at most 150 seconds for each Browser Use sign-in agent run, and less when the call has less time left, so a sign-in plus the tool fits in one call; a slower run ends the call with an error.
The verification code arrives in a separate tool call, so waiting for the user never holds a request open.
For work that takes longer than one request, durable operation status that clients check is aspirational.

## Authentication and private data

Keep every connection, browser profile, tool, and pending operation limited to its owner.
Clerk sign-in protects the dashboard and its routes, and each route reaches only the signed-in user's apps.

An app's connection link is the only access control on MCP use, and Nathan accepted this trade-off.
Anyone with the link can run that app's tools, read its website's pages with its saved sign-in, save tools to it, and, for the owner's apps, order, but the link reaches nothing else.
Keep the link private, and select **Regenerate link** on the app page if it leaks, then replace the URL in the ChatGPT connector.
MCParrot never logs tokens, and Sentry removes `token` and `x-vercel-protection-bypass` query values.
An older owner link carries the Vercel bypass secret, which also skips Vercel Authentication on every page while it is on; after Vercel Authentication is off, that secret only opens the owner's app connections.
To stop older links, regenerate the bypass secret: open the Vercel project, go to Settings, then Deployment Protection, then Protection Bypass for Automation, regenerate it, and redeploy.
The server rejects cross-site `/api/*` requests that change data, so another website cannot use a signed-in browser to call them, and every page forbids framing by other websites.
MCP sign-in for each user remains aspirational.

The Browser Use profile holds the website's cookies inside Browser Use, and MCParrot stores only its ID.
A sign-in browser's live view address works like a password while the browser runs, so MCParrot shows it only on the protected app page.
MCParrot encrypts each saved login with AES-256-GCM before it reaches Redis, using the 32-byte key in `MCPARROT_CREDENTIAL_KEY`.
That key is a Sensitive Vercel variable in production and preview, separate from the Redis credentials, so a Redis leak alone does not reveal passwords.
Only the automatic sign-in step on the server decrypts a login, and it passes the username and password to Browser Use only as secret bindings for the app's website and sign-in hosts.
The password never returns to the dashboard, never appears in MCP results, and never reaches an AI model, a log, or Sentry.
`/api/login` checks that the app belongs to the signed-in user before it saves or deletes a login.
Deleting a saved login removes its record; ending existing website sessions is a separate action.
Keep secrets out of prompts, public tool definitions, logs, traces, documentation, and source control.
Nathan decided on October 18, 2026, that AI tools may see any website content, including session IDs, identifiers, and private pages.
Recordings and saved tools must still never contain cookie values, `authorization` values, or token header values, because saved tools can be shared on the marketplace; `tokenHeaders` keep only header names and read their values fresh inside the page when a tool runs.
The extension skips cookies, sign-in pages, sign-in header values, `authorization`, and headers with secret names or secret-shaped values, and both the extension and `/api/discover` redact secret-looking values in samples and request bodies, as [recording in the explore tab](#recording-in-the-explore-tab) and [discovery data sent to Claude](#discovery-data-sent-to-claude) describe.
That redaction matches patterns, so a secret in another form can still reach the recording and Claude, which the [status page](STATUS.md) lists as a gap.
Recordings stay only in the extension, which deletes them after 30 days.

## Diagnostics with Sentry

Sentry is a service that collects errors, traces, logs, and session recordings to help find problems.
MCParrot uses `@sentry/nextjs` in the browser and on the server, and it sends everything to the Sentry project `nathan-s4/mcparrot`.
The SDK reads `NEXT_PUBLIC_SENTRY_DSN`, and the build uploads source maps with `SENTRY_AUTH_TOKEN`, so stack traces show the original code.
Browser events go through the same-site route `/monitoring`, which forwards them to Sentry, so ad blockers do not drop them and Vercel Authentication lets them through.
MCParrot keeps every trace and every session because it has few users, and it sends logs through the SDK instead of a Vercel Log Drain.

| Sentry product | What MCParrot sends |
| --- | --- |
| Error monitoring | Unhandled server route errors, React render errors, and Claude failures that discovery reports to the user |
| Tracing | Each route request, with the spans `discover.agent`, `browser_use.start`, `browser_use.cdp_connect`, `browser_use.stop`, one `task.run` for each tool run, `read_page` call, and image read with `browser.reused`, `browser_use.warm_lookup` for the warm browser lookup, `page.open_website` for opening the website, `browser_use.agent_sign_in` and `browser_use.agent_verification_code` with the agent's outcome, `browser_use.agent_order_prepare`, `browser_use.agent_order_check_total`, and `browser_use.agent_order_place` with the order total and outcome, one `task.request` for each request a tool or `read_page` runs, one `page.read` with the text size for each HTML page opened as text, one `image.read` with the picture size and one `image.describe` as a `gen_ai.invoke_agent` span with Claude's outcome for each image read, and one `task.save` with the tool name for each `save_task` call |
| Logs | Discovery started and finished with the request and capability counts, sign-in started and done, login saved and deleted, each automatic sign-in, automatic Google sign-in, and verification code outcome, each tool run's, `read_page` call's, and image read's outcome, including whether the website was signed out, whether the warm browser was reused, and each step's duration in milliseconds, such as `browserStartMs`, `cdpConnectMs`, `websiteOpenMs`, `request1Ms`, `request1PageReadMs`, and `totalMs`, each image that Claude described with its reply length, each tool that ChatGPT saved, with only the app ID and tool name, and each order's prepare, payment, refusal, and cancel outcome with only the app ID, the outcome or refusal reason, and the amounts |
| Session Replay | Recordings of dashboard sessions, with all text, inputs, and link and image addresses masked |
| AI agent monitoring | The `discover.agent` and `image.describe` spans as `gen_ai.invoke_agent` spans with the model name, and one MCP span for each ChatGPT tool call, tagged with the app ID |

Spans carry only non-secret attributes, such as the app ID, tool name, request count, response status, and response size.
The SDK sends no cookies, headers, request or response bodies, URL query values, stack-frame variables, user details, or AI prompts and replies.
MCP spans record neither tool inputs nor tool results, because inputs can hold verification codes and results are website responses; `read_page` logs carry only the app ID, the result size, and any failure reason, never the page text.
Order logs and spans never carry the delivery address, the items, the order request, the Link connection ID, or the Link email.
Before sending, the SDK removes URL query strings from span names, events, and breadcrumbs, and replaces `token` and bypass secret query values with `[Filtered]` in spans, events, and logs.
Never attach credentials, cookies, tokens, verification codes, or the bypass secret to Sentry data.

ChatGPT first sends each request in the MCP protocol version 2026-07-28, which no MCP TypeScript SDK release supports yet.
The route answers with a 400 error that names the supported versions, and the 2026-07-28 specification tells clients to then fall back to the `initialize` handshake, which settles on version 2025-11-25.
Sentry ignores that expected error, and also the expected tool outcomes for a signed-out website, a code with no waiting sign-in, an address on another origin, a rejected login, a failed sign-in, and the order refusals for Link in live mode or an unreadable Link status, a total above the limit or a changed total, ordering turned off, and an unknown order ID, so they do not hide real failures in Issues.

## Workspace navigation behavior

App and exploration pages have stable addresses under `/apps/<app-id>` and `/apps/<app-id>/explore`.
Browser Back and Forward restore the matching workspace screen, and refreshing those addresses restores the stored apps and tools.
The same apps appear on any device where the user signs in.
Each app page shows the app name, its website address, **Delete app** beside **Explore website**, and status labels for sign-in, a saved login, and ordering.
On wide screens the app's tools fill the main column, one row each with its name and description, and selecting a row shows its inputs, its result, its answer fields, its requests, and **Delete tool**.
A filter box appears above the list when the app has more than 8 tools.
A setup column beside the list holds Website sign-in, Saved login, Use in ChatGPT, Marketplace, View image, and, for the owner, Ordering in that order, and it stays in view while the list scrolls.
On screens 700 pixels wide or narrower, the setup sections come first as collapsed sections that show their status, and the tools list follows.
Select **Delete app** at the top of an app page, then confirm in the dialog to remove that app, its tools, its saved login, its ChatGPT link, and its marketplace listing from MCParrot and delete its recorded requests in the extension.
**Keep app** or Escape closes the dialog and returns focus to **Delete app**.
Deletion does not remove the website account.
An old link to a deleted app shows an unavailable page with a return to the app list.

## Running the frontend

Use Node.js 24, which `.nvmrc` and the `engines` field in `package.json` pin.
`.env.example` lists every environment variable the app needs.
The dashboard needs `KV_REST_API_URL` and `KV_REST_API_TOKEN` in `.env.local`, which `npx vercel env pull .env.local` writes.
That command replaces the file, so add `CURSOR_API_KEY` for discovery and `BROWSER_USE_API_KEY` for sign-in and tools again afterwards.
Add `MCPARROT_CREDENTIAL_KEY` to save logins; it must be standard base64 of exactly 32 bytes, for example from `openssl rand -base64 32`, or saving a login returns a setup error.
The production key is Sensitive and cannot be pulled, so logins saved locally cannot be read in production.
The pulled `KV_REST_API_URL` and `KV_REST_API_TOKEN` point at the production Redis, so a login saved from a local server overwrites the app's production login with one that production cannot decrypt, and other local changes reach production apps too.
Replace those two values with a separate Redis database before you save logins or change apps locally.
Add `NEXT_PUBLIC_SENTRY_DSN` to send diagnostics and `SENTRY_AUTH_TOKEN` to upload source maps during `npm run build`; without them, Sentry stays off.
Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` from the Clerk integration, and `MCPARROT_OWNER_EMAIL`; the app needs the Clerk keys to start.
Signing in locally as the owner moves the production `workspace` value when the pulled Redis values point at production.
The development server listens on `localhost`, because Clerk's development middleware sends requests to that host name.

```sh
npm install
npm run dev -- --port 4317
```

Open [http://localhost:4317](http://localhost:4317) when the development server starts.
Open [http://localhost:4317/docs](http://localhost:4317/docs) to read Nathan's HTML guides.
MCParrot Explorer connects to this local dashboard as well as to the production site.

## Running the task runner

The task runner sends one natural-language task to a Browser Use Cloud agent.
It is dormant: sign-in and tool runs use Browser Use cloud browsers directly, not this runner.
Use Node.js 24, and have a Browser Use account.

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
Run `npm run check` to check syntax, check that `public/downloads/mcparrot-explorer.zip` holds exactly the files in `public/extension`, and check types, without starting a task.
See the [Browser Use quick start](https://docs.browser-use.com/cloud/quickstart) for setup instructions.
