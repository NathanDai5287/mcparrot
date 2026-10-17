# LA Hacks hackathon context

This document gives agents the event facts for AI Hackathon 2026 by LA Hacks, where the team will submit MCP Anything.
Use it to choose demo scope, submission assets, and sponsor integrations.
It covers judging criteria, tracks, target prizes, and submission requirements, but it does not change product behavior.
The [product specification](README.md) defines what the product does, and the [LA Hacks guide](docs/hackathon.html) is Nathan's version of this document.
The event site is [ai.lahacks.com](https://ai.lahacks.com), and submissions go through [Devpost](https://devpost.com).

## LA Hacks event basics

| Item | Detail |
| --- | --- |
| Event | AI Hackathon 2026 by LA Hacks |
| Format | In person at UCLA (James West Alumni Center); invite-only after you apply, are accepted, and RSVP |
| Eligibility | College students above the local age of majority, from most countries |
| Devpost deadline | Oct 18, 2026 at 12:00pm PDT |
| Judging | The team must be present in person during judging to be scored and win prizes |
| Applications and updates | [ai.lahacks.com](https://ai.lahacks.com) |

## Devpost submission requirements

Each submission needs all four of these items:

1. A project description that says what the project does, what problem it solves, and which track and company challenges apply.
2. A public code repository with documented source code.
3. A demo video of two to three minutes that walks through the features and how they work.
4. A complete Devpost page with a summary, the technologies used, and links such as designs and API docs.

The work must be original, follow the hackathon rules, and be completed within the hackathon time period.

## Official judging criteria

Judges score each project on four criteria, so the demo and documents should address all of them.

| Criterion | What judges look for |
| --- | --- |
| Technical depth | Real engineering, with system design and meaningful implementation beyond thin template integrations |
| Product thinking and impact | A clear problem and user, careful design, and believable real-world use |
| Execution and polish | Working features, a smooth demo, and a consistent experience |
| Originality and insight | A fresh idea, a clever implementation, or a unique insight |

## Devpost event tracks

Each submission picks one primary track and must name it in the Devpost description.
Applied Intelligence is the primary track for MCP Anything, and Agentverse is a secondary fit.

| Track | Fit for MCP Anything |
| --- | --- |
| Applied Intelligence | Strong primary fit, because it rewards practical AI that improves everyday work: teach a task once, then use it from an assistant |
| Agentverse (Fetch.ai) | Strong secondary fit, because saved MCP tools can act as agents that turn a request into a result |
| Model Learning | Weak fit unless the submission centers on training or adaptive models |
| Beyond the Digital | Weak fit unless hardware, AR, or VR is central |

## Aligned company challenges

Companies sponsor separate challenges with their own prizes and requirements.
Pursue only the challenges that the demo can honestly prove.
Do not claim a sponsor prize without meeting that challenge's stated requirements and supplemental forms.
For example, the Commit Fellowship requires a supplemental form.

### Primary sponsor challenges

| Sponsor | Challenge | Why it matches |
| --- | --- | --- |
| Browser Use | Best Use of Browser Use | The product uses hosted interactive browsers for sign-in and browser-dependent steps |
| Sentry | Best Use of Sentry | Requires error monitoring plus at least two other Sentry products, such as Replay, Logs, Tracing, Profiling, Uptime, or AI agent monitoring; the demo must show how that evidence changed what we built |
| Fetch.ai | ASI:One Agent Challenge (Agentverse) | Rewards agents that turn intent into action; it fits only if the demo shows MCP tools registered as agents |

### Secondary sponsor challenges

Pursue these only if the demo supports them.

| Sponsor | Challenge | Notes |
| --- | --- | --- |
| Paper | Best Designed Hack | Judges design fundamentals and craft; the Calm workspace design is the entry, and the prototypes are references only |
| Creao AI | AI-first disruptor, one-person company, or team empowerment | Fits the story that an agent does the work; choose categories when you submit, as the event site describes |
| Base44 | Build Something People Want | Needs a real user, a problem-first approach, and a usable product rather than a demo shell |
| Cognition | Best Use of Devin | Applies only if Devin built a meaningful part of the project |

## Other listed prizes

Devpost also lists many MLH category prizes, such as Gemini, Snowflake, ElevenLabs, Vultr, Solana, Tiger Data, and a GoDaddy domain.
It also lists sponsor cash prizes from companies such as Visa, Workday, Even Realities, Espressif, and veri.studio.
Target one of these prizes only if the demo integrates that technology in a meaningful way.
The authoritative prize amounts and rules are in each prize's own description on Devpost and on the event site.
Devpost lists the LA Hacks grand prize amounts as TBD, so confirm them at [ai.lahacks.com](https://ai.lahacks.com).

## Demo planning implications

Prove one complete path before building a wide interface.
The strongest path shows a task taught once, its verified replay, and an assistant calling it through MCP.
This path addresses technical depth and execution better than a polished interface without working features.
Lead with the user and the problem: a student or frequent user stops repeating tedious website navigation.
Canvas is an example of that user's website, not the only one.

Show clearly which parts work and which are planned, because judges penalize polish that hides parts that do not work.
Match the demo claims to the [current status](README.md#current-implementation-status) in the product specification.
Plan the Devpost text, a clean public repository, and a video that shows the same flow that judges see live.
To claim the Sentry prize, show evidence from Tracing, Logs, Replay, or another allowed product, not only caught errors.
To claim the Browser Use prize, show a working web agent and the people it serves.
