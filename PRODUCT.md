# Product

<!-- impeccable:product-schema 1 -->

This document records the product facts that design work on MCParrot must respect.
The [product specification](README.md) remains the authority for behavior, and the [status page](STATUS.md) records what works today.

## Platform

web

## Users

MCParrot is for anyone who wants ChatGPT to use a website they already sign in to, such as a school portal, a grading site, or a food or shopping site.
These people use the site in their own browser today and want an assistant to read it, and later act on it, for them.
Most of them are not developers, so every screen must make sense without knowing what an API, a request, or MCP is.
Nathan is the only real user today, and hackathon judges watch the product during the demo.

## Product Purpose

MCParrot turns a website into a set of ChatGPT tools.
A person browses the site once in their own browser, MCParrot finds what the site can do, and the person chooses which tools to keep.
ChatGPT then runs those tools in a signed-in cloud browser, without the person clicking through the site again.
Success means a person can ask ChatGPT for something on a site with no official API and get the right answer.

## Positioning

MCParrot makes any website a ChatGPT tool after one browse in the person's own browser, with no official API and no code.
Other assistants can browse the web, but they do not learn a person's own signed-in sites once and keep reusable tools for them.

## Operating Context

A person works through three steps on the dashboard: explore the website, find what it can do, and choose the tools to keep.
Exploring happens in the person's normal Chrome or Edge browser through the MCParrot Explorer extension.
The person then signs in once in a cloud browser and copies a connection link into ChatGPT.
After that, most use happens inside ChatGPT, so the dashboard is a place people visit to set things up, not to work in every day.

## Capabilities and Constraints

Every capability needs an equal path through the dashboard and through MCP, as the [UI and MCP parity section](README.md#ui-and-mcp-parity) describes.
Status words are limited to shipped, dormant, aspirational, and gap, as the [documentation guide](DOCUMENTATION.md#use-status-vocabulary) describes.
Secrets, passwords, and payment details never appear in the interface, logs, or prompts.
Ordering and payment are a gap until a live check passes, and they must always show the total and wait for the person's approval.
Each user signs in with their own account, only the owner can order, and the shared app marketplace lets users copy each other's tools; the [status page](STATUS.md) records the status of each.

## Brand Commitments

The product name is MCParrot, and the dashboard already has a wordmark and an incumbent visual system in `app/globals.css`.
Interface copy uses short, plain sentences in simple technical English.

## Evidence on Hand

Canvas at bcourses.berkeley.edu works end to end through ChatGPT, including reading a course syllabus.
A Gradescope app exists in the workspace.
No customers, testimonials, usage numbers, or pricing exist, so design work must not invent them.

## Product Principles

1. Explain each step from the person's point of view, and hide technical terms unless the person needs them.
2. Keep the three steps of explore, find, and choose obvious at every point.
3. Show what the assistant can do and whether it is signed in, because that is what people come to check.
4. Ask before anything spends money or changes a website, and make the approval clear.
5. Never present an unbuilt capability as working.
