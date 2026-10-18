# Agent Entry Point

This document is the starting point for coding agents who work in this repository.
It lists every document, who reads it, and what it covers.
It then gives the few rules that apply to the whole repository and have no other home.
Read the product specification and the collaboration process before material work.

## Repository Document Map

| Document | Reader | What it covers |
| --- | --- | --- |
| [Product specification](README.md) | Agents | Product behavior, UI and MCP parity, technical assumptions, and local setup |
| [Status page](STATUS.md) | Agents | What is shipped, dormant, aspirational, and known gaps |
| [Documentation guide](DOCUMENTATION.md) | Agents | How to write and organize every document in this repository |
| [Collaboration process](WORKING_WITH_NATHAN.md) | Agents | How to reach a shared understanding with Nathan and record the agreement |
| [Hackathon facts](HACKATHON.md) | Agents | Event rules, judging, sponsors, demo scope, and submission assets |
| [Product guide](public/docs/index.html) | Nathan | Plain-language mirror of the product specification |
| [Status guide](public/docs/status.html) | Nathan | Plain-language mirror of the status page |
| [Hackathon guide](public/docs/hackathon.html) | Nathan | Plain-language mirror of the hackathon facts |
| [Working together guide](public/docs/working-together.html) | Nathan | Plain-language mirror of the collaboration process |

## Repository-Wide Rules

Follow the [documentation guide](DOCUMENTATION.md) whenever you add or change a document.
Give every user capability an equal path through the UI and through MCP, as the [UI and MCP parity section](README.md#ui-and-mcp-parity) describes.
Use only the status words in the [documentation guide](DOCUMENTATION.md#use-status-vocabulary), and update the [status page](STATUS.md) when a capability's status changes.
Keep secrets, such as passwords, cookies, tokens, API keys, and `.env` files, out of prompts, logs, traces, documentation, and source control.
