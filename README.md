# MCP Anything

Connect a website to your assistant so you can use it without navigating its pages.
The product supports many tasks on each connected website.
Canvas is one personal test case, not a product limit.

## Product goal

You connect a website once and enable multiple actions through that connection.
On Canvas, your assistant could find assignments, check deadlines, read announcements, and locate course materials.
You can also ask for tasks that combine these actions.
For example: “Find this week's assignments and the materials I need for each one.”

MCP means Model Context Protocol.
It lets an assistant discover and use tools supplied by another application.
MCP Anything supplies website tools and uses Browser Use to carry out their actions in a real browser.

The intended user already uses an MCP-compatible assistant and wants to avoid repeated website navigation.
The same connection model, tool definitions, and browser execution should work across websites.
Canvas provides a concrete way to test the product, rather than defining its limits.

## Planned user flow

1. Open the local app and select **Connect website**.
2. Enter a website address and name the connection.
3. Sign in through the Browser Use browser, including any extra sign-in steps.
4. Let the app inspect accessible pages and propose useful actions.
5. Review the proposed tools and test the ones you want to enable.
6. Connect your assistant using the supplied MCP setup instructions.
7. Ask your assistant for information or actions on that website.
8. Return to the app when you need to sign in again, inspect a failed task, or change enabled tools.

Normal use happens inside your existing assistant.
The app manages website connections, tools, sign-in, and task history.
A Chrome extension is not required for the first version.

## How tasks work

Each website connection has its own address, browser profile, and tool list.
A saved tool describes an action, its accepted inputs, and its expected result.
For Canvas, a tool might list assignments for a course within a date range.
Changing the course or date range does not require creating another tool.

Your assistant selects tools and combines their results to answer a request.
The local MCP server validates inputs and asks Browser Use to perform each website action.
The result includes source links when available, so you can check what the assistant found.
Browser Use remains the main execution path; a Canvas-specific API does not replace it.

The connection also offers a general browser task tool for requests without a matching saved tool.
This tool attempts the task using the connected website and your current permissions.
After a successful run, the app can propose a reusable tool for review and another test.
Saved tools still use the browser agent initially; they do not imply fixed click playback or guaranteed speed.

New combinations of existing tools can work immediately.
Unfamiliar actions can fail, require clarification, or need another sign-in.
Discovery does not guarantee a complete list of everything a website can do.
The first release supports reading information; submissions and other website changes come after a working approval flow.

## Recommended stack

Use TypeScript across the planned application so the app and MCP tools share input and result types.

| Part | Choice | Purpose |
| --- | --- | --- |
| App and local server | [Next.js with React and TypeScript](https://nextjs.org/docs/app/getting-started) | Manage connections and tools in one application |
| Runtime | Node.js 24 | Keep the existing local runtime |
| Browser actions | [Browser Use Cloud V4 and its TypeScript SDK](https://docs.browser-use.com/cloud/agent/quickstart) | Perform tasks in a hosted browser |
| Assistant connection | [Official MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/) with Zod | Define tools and check inputs |
| First MCP transport | [Local stdio](https://ts.sdk.modelcontextprotocol.io/server#stdio) | Let a compatible assistant start the server directly |
| Local storage | JSON files under `.local/` | Save connection metadata and tool definitions without adding a database |
| Errors and diagnostics | [Sentry](https://docs.sentry.io/platforms/javascript/guides/nextjs/) | Record errors, Tracing, and Logs |

The local app and MCP entry point share the same website execution logic.
Browser Use hosts the browser; the app and MCP server run on your computer.
Start with a local MCP client that supports stdio.
Remote assistant connections through Streamable HTTP can follow after the local flow works.
Use SQLite only if file storage becomes insufficient.
Use Browser Use's managed agent initially, without adding another model provider or agent framework.

## Sign-in and data

Use a [Browser Use profile](https://docs.browser-use.com/cloud/guides/authentication) to preserve cookies and login state between browser runs.
Keep the profile associated with its website connection and user.
Use [browser handoff](https://docs.browser-use.com/cloud/agent/human-in-the-loop) when the user must sign in or complete another manual step.
Test sign-in on the first target website before building the rest of the app.
Website restrictions or expired sessions may require another manual sign-in.

Keep API keys, browser access links, cookies, and course results out of the public repository.
Store only connection metadata and tool definitions locally at first.
Send task status, duration, and error details to Sentry without student content or authentication data.

## Working process

Work in this order, with a working demonstration at the end of each stage.

| Stage | Work | Completion check |
| --- | --- | --- |
| 1. Prove website access | Connect Browser Use to a website and complete manual sign-in if needed | Read actual information and verify it against the website |
| 2. Prove the assistant connection | Expose one reading action through a local MCP server | Ask an MCP client for information and receive verified results |
| 3. Add Sentry early | Add error monitoring, Tracing, and Logs to that complete flow | Follow one request through its trace and associated logs |
| 4. Build connection management | Add the local app, saved connection, and sign-in status | Reopen the app and reuse the connection, or receive a clear sign-in request |
| 5. Support multiple actions | Add separate tools for more actions on the connected website | Answer a new request that combines at least two tools |
| 6. Attempt unfamiliar tasks | Add the general task tool and review successful tool proposals | Complete an unlisted reading task and test a proposed tool again |
| 7. Demonstrate general use | Connect another website through the same flow | Complete a reading task without changing the connection model |
| 8. Prepare the hackathon demo | Fix a real issue using Sentry and record the result | Show the issue, supporting evidence, fix, and successful repeat |

Start with stages 1 and 2.
The first milestone is: “From my assistant, read actual information from a connected website through Browser Use.”
Use Canvas assignments to test this milestone with a personally useful example.
Build and verify this path before spending time on visual design or automatic tool discovery.
Keep the first tool explicit so discovery does not block proof of the core connection.

For the Browser Use entry, demonstrate a complete website task and explain who it helps.
For the Sentry entry, demonstrate Tracing and Logs in addition to error monitoring.
Show how this evidence led to a real reliability or speed improvement.

## Current status

The repository currently contains a local Browser Use task runner and its setup instructions.
The app, Canvas connection, saved tools, MCP server, and Sentry integration are planned.
Syntax checking does not prove a live browser task or Canvas sign-in works.

## Run the existing task runner

Use Node.js 24 or later.

1. Install the required package with `npm install`.
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

See the [Browser Use quick start](https://docs.browser-use.com/cloud/quickstart) for the official setup instructions.
