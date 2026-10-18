# Documentation Guide

This guide explains how to write and organize every document in this repository.
It applies to the Markdown documents that coding agents read and to the HTML guides that Nathan reads.
The first sections give the general rules for any document.
The section on matching documents to readers adds the rules that are specific to this repository.
The guide ends with a short note from Nathan about how these rules came to exist.

## Give Information One Home

Give each document one distinct purpose and state it at the start.
Search existing documents before adding information.
If a document already covers that purpose, update it and link to it from other documents.
Keep each fact or instruction in one authoritative home.
Combine documents with the same purpose, or reorganize overlapping information into distinct subjects.

## Make Documents Glanceable

A glanceable document shows readers what information exists and where to find it during a quick scan.
Start with a general overview paragraph or a table of contents formatted as an actual table.
Keep specific guidance in the relevant sections.

Use descriptive headings of three or four words without colon subtitles.
Keep each section focused on its heading’s subject.
Use descriptive link names so readers know what each reference contains.

## Write Clear Connected Prose

Use prose by default, with complete sentences that explain how ideas connect.
Aim for four to five sentences per paragraph, without padding shorter paragraphs.
Write for readers without technical knowledge or prior context.
Use familiar words and short sentences, explain necessary terms, and provide enough background to understand the subject.
Remove details and phrases that add no useful information.
Preserve the context, connections, and meaning readers need to understand the subject.

Use bullets for actual lists or steps when they improve clarity.
Too many bullets can break connections and force readers to reread an explanation.
For procedures, state established responsibilities, prerequisites, and completion criteria when needed.
Number steps when order matters, with one instruction per step.

## Record Current Conclusions

Record final conclusions and the current agreed state.
Leave out deliberation, intermediate decisions, superseded versions, and the path taken to reach the result.
Replace outdated guidance when an agreed conclusion changes.

## Use Status Vocabulary

Describe the status of a capability with only four words: shipped, dormant, aspirational, and gap.
Shipped means that the capability exists and runs today; if you cannot point to its code and to a check that ran and passed, it is not shipped.
Dormant means that the code exists but nothing uses it yet, and the document must say so.
Aspirational means that the capability is designed or agreed but not built, so never describe it in the present tense as if it exists.
A gap is a known missing foundation or defect inside something shipped, and the document must state it honestly instead of hiding it.

Do not use other status words, such as planned, implemented, done, completed, in progress, WIP, or coming soon.
Do not use verified as a status either, although you may still use it to describe evidence, as in "the deployment check passed and verified the dashboard."
Describe how a shipped capability works in its subject document, mark designed but unbuilt behavior as aspirational, and list missing foundations as gaps.
The [status page](STATUS.md) and the [status guide](public/docs/status.html) are the single home for the status of every capability.
Other documents may tag a sentence with a status word, but they must not keep their own status lists, and they must link to the status page instead.
When a capability ships or otherwise changes status, update the status page in the same change.

## Match Documents to Readers

This repository has two kinds of readers, and each one gets its own format.
Coding agents read Markdown files, and Nathan reads HTML guides under `public/docs/`.
The app serves those guides at [http://localhost:4317/docs](http://localhost:4317/docs) and [https://mcparrot.vercel.app/docs](https://mcparrot.vercel.app/docs).
Write the HTML guides in plain language for a reader with no technical context.
Some subjects need both forms, so they live in mirror pairs.
The [product specification](README.md) mirrors the [product guide](public/docs/index.html), the [hackathon facts](HACKATHON.md) mirror the [hackathon guide](public/docs/hackathon.html), the [collaboration process](WORKING_WITH_NATHAN.md) mirrors the [working together guide](public/docs/working-together.html), and the [status page](STATUS.md) mirrors the [status guide](public/docs/status.html).

When agreed behavior changes, update both documents of a pair in the same change.
Keep examples, defaults, failure states, and limitations the same in both forms.
Build the HTML guides with the ICP-docs visual language and the local stylesheet in `public/docs/assets/`.
Do not depend on a generator from another repository.
When you add, rename, or remove a document, update the document table in the [agent entry point](AGENTS.md) in the same change.
Keep secrets, such as passwords, cookies, tokens, and API keys, out of all documentation.

## Document Documentation

Here's the funny part: this was a document about how to write documents. Every time I updated it, I'd hand it to my LLM and say, "Rewrite this, following the rules inside it." Then I'd read what came back, cringe a little, and amend the rules, which of course meant rewriting the document again.

Somewhere around the twelfth iteration, I lost track of who was editing whom, and I began to suspect that it was the document that was actually editing me. So here's a small tribute to the one part of the document written by a human, the anchor keeping all this recursion from spiraling into infinity.
