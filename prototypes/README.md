# Static dashboard design prototypes

This folder holds static HTML simulations of three visual directions for the MCParrot dashboard.
The local frontend uses the Calm workspace design, and the other two directions remain comparison references.
Open [the prototype gallery](index.html) directly from the file system, or serve this repository with a local HTTP server.
No packages, build process, or account setup are needed.
The prototypes simulate sample flows only and say nothing about product status.
[The status page](../STATUS.md) records what the product does today.

## Three design directions

| Direction | Appearance | Desktop structure | Small screens |
| --- | --- | --- | --- |
| [Calm workspace](calm/index.html) | Light surfaces, teal actions, sans-serif text | Fixed sidebar and website rows with task labels | Sidebar becomes a top bar; website rows remain stacked |
| [Warm library](folio/index.html) | Warm cream surfaces, vermilion actions, serif headings | Top navigation, wide website rows, and a separate assistant panel | Navigation wraps; the assistant panel moves below the website rows |
| [Night desk](night/index.html) | Graphite surfaces, mint actions, sans-serif text | Narrow navigation rail and a website and task split view | Rail becomes a top bar; website choices sit above the task panel |

Each page links back to the gallery through **Compare designs**.

## Paper draft boards

The Paper file [MCParrot dashboard options](https://app.paper.design/file/01M55WYB3QFM5TWPNEFXSG8MXQ) contains three editable draft boards, one for each direction.
Their layout differs from the HTML prototypes, and nobody has verified them as a design source.
The Calm HTML prototype governs the frontend design.

## Sample prototype journey

1. Create a website app with a name and address, then simulate sign-in.
2. Name a task and click through its sample demonstration.
3. Complete the sample steps to enable review.
4. Change the proposed input name and test value, then run the sample test.
5. Save the task after the test; a change to either input requires another test.
6. Try a saved task, or view the sample MCP address for an assistant connection.
7. Explore expired-session recovery, simulated verification, and the resumed sample result.

Canvas, YouTube, and Notion supply different sample content.
The Activity screen lists teaching, testing, task runs, and recovery events from the current page session.

## Shared interaction contract

Each page loads `assets/flow.css` and a deferred `assets/flow.js` through relative paths.
Each direction supplies its own first dashboard inside `main#view`.
The shared script stores that dashboard as Home and replaces the contents of `#view` during navigation.
Persistent navigation stays outside `#view`.

Controls use `data-action` to request a shared screen or action.
Website-specific controls also use `data-app`, with the sample IDs `canvas`, `youtube`, and `notion`.
Shared entry actions are `home`, `new-app`, `open-app`, `teach`, `connect`, `activity`, and `reconnect`.
The script owns the later teaching, review, test, save, connection, and verification screens.
Each direction defines the shared CSS variables `--bg`, `--surface`, `--ink`, `--muted`, `--line`, `--accent`, `--accent-ink`, `--soft`, and `--radius`.

## Known prototype limits

All website names, task results, and connection states are synthetic examples.
State stays in page memory and resets when the page reloads.
Teaching and verification are simulations, not live browser sessions.
The prototypes do not capture requests, store credentials, run website tasks, or provide a working MCP connection.

## Screenshots and layout checks

Preview screenshots of the three dashboards are in `assets/previews/`.
The gallery and each dashboard's first view were checked at 1440 × 1000 and 390 × 844.
More review screenshots are in `../.impeccable/review/`, but they do not verify every interaction.
