# LA Hacks hackathon context

This document gives agents the event facts for AI Hackathon 2026 by LA Hacks, where the team will submit MCParrot.
Use it to choose demo scope, submission assets, and sponsor integrations.
It covers the judging-day schedule, judging rounds and criteria, tracks, target prizes, submission requirements, and the organizers' pitch guidelines, but it does not change product behavior.
The [product specification](README.md) defines what the product does, and the [LA Hacks guide](public/docs/hackathon.html) is Nathan's version of this document.
The event site is [ai.lahacks.com](https://ai.lahacks.com), and submissions go through [the LA Hacks AI Hackathon 2026 Devpost page](https://la-ai-hackathon-2026.devpost.com/).
The schedule, rounds, rubric, Devpost details, and pitch guidelines come from the organizers' "Pitching & Submitting Your Project" slides, which this document summarizes.

## LA Hacks event basics

| Item | Detail |
| --- | --- |
| Event | AI Hackathon 2026 by LA Hacks |
| Format | In person at UCLA (James West Alumni Center); invite-only after you apply, are accepted, and RSVP |
| Eligibility | College students above the local age of majority, from most countries |
| Devpost deadline | Oct 18, 2026 at 12:00pm PDT |
| Judging | The whole team must be present in person during judging to be scored and win prizes, with no virtual option |
| Applications and updates | [ai.lahacks.com](https://ai.lahacks.com) |

## Judging day schedule

Hacking and submissions both end at noon on Sunday, October 18, 2026, and the organizers keep no buffer, so a late submission never reaches the judging list.
Submit a draft early, because Devpost lets the team edit it until the deadline.
The organizers share table numbers in a spreadsheet through Discord or email, and the team must find its table and set up by 12:30pm.
Every team member must stay in person all afternoon and report to the stage immediately if the organizers call the project for the Top 5.

| Time | Event |
| --- | --- |
| 12:00pm | Hacking ends, coding stops, and Devpost submissions close |
| 12:30pm to 1:45pm | Science fair judging at the assigned table; judges reach the floor around 12:30pm |
| 2:15pm to 3:00pm | Top 5 live demos on the main stage, where the opening ceremony took place |
| 3:15pm to 4:00pm | Closing ceremony, where the organizers announce winners and award every prize in person |

## Judging rounds and results

Round 1 is science fair judging at the team's table, with at most 5 minutes for each judge group: a 2-minute pitch and demo, then 3 minutes of questions.
The team pitches many times, and the Jury system (Gavel 2.0) ranks projects by Elo, comparing each project with the others instead of using fixed scores, and it does not send more judges to high-ranking teams.
In practice, general judges weigh how clean and convincing the demo is and how well the team answers questions, and they compare each project with the projects they saw before and after it.
The demo matters most in person and on video, and the Devpost page decides only between projects at the top of the science fair ranking.
Each company challenge picks its winner with its own rubric and method during Round 1: some judges visit tables for more or less than 5 minutes, and others judge only from Devpost.

After Round 1, the organizers review the top Elo rankings, and MLH runs cheating checks on the top projects and disqualifies any team caught cheating.
The five highest projects that pass go to Round 2 on the main stage at about 2:15pm, where each team gets 7 minutes: at most 3 minutes of demo and pitch, then 4 minutes of questions from a panel of 5 judges.
About 100 Round 2 judges each fill out a form with their top 3, and majority vote picks the winners among the Top 5.
The highest project in each track, other than the top 3 winners, wins that track, and side awards combine other judging panels, MLH, and the overall Elo ranking.
A judge who agrees to share contact details may let the team photograph their badge, and after judging the organizers send a form that needs both the judge's name and the badge photo; never share your own details during judging or photograph a badge without consent.

## Devpost submission requirements

Submit on [the LA Hacks AI Hackathon 2026 Devpost page](https://la-ai-hackathon-2026.devpost.com/), and add every teammate.
Devpost asks for the email each person used to apply to LA Hacks, and a project whose emails are not on the checked-in list is disqualified as not in person.
Each submission needs all of these items:

1. One of the three main tracks, plus opt-ins for every applicable company challenge and for Agentverse.
2. A project description that says what the project does, what problem it solves, and which track and company challenges apply.
3. A public GitHub repository with documented source code.
4. A demo video of two to three minutes, posted as a YouTube link, that walks through the features and how they work.
5. A complete Devpost page with a summary, the technologies used, and links such as designs and API docs.

The [Devpost submission page](public/docs/devpost.html), deployed at [https://mcparrot.vercel.app/docs/devpost.html](https://mcparrot.vercel.app/docs/devpost.html), holds the project description we submit.
The work must be original, follow the hackathon rules, and be completed within the hackathon time period.

The organizers recommend a thumbnail image with a 5:3 ratio and a short, clean YouTube demo, uploaded early enough for YouTube to finish processing it.
They recommend a description that tells the story and inspiration, what the project does, how the team built it, how it meets each company challenge, and what the team learned.
Their strong examples use a heading for each of those subjects, explain each feature in a full paragraph, and include pictures or diagrams of how the project works.
Their weak examples give one sentence, or only a list of technologies, under each heading.
Judges, especially company challenge judges, read the Devpost page during and after science fair judging, particularly when they cannot visit every table.

## Official judging criteria

Judges score each project on four criteria, so the demo and documents should address all of them.

| Criterion | What judges look for |
| --- | --- |
| Technical depth | Real engineering, with system design and meaningful implementation beyond thin template integrations |
| Product thinking and impact | A clear problem and user, careful design, and believable real-world use |
| Execution and polish | Working features, a smooth demo, and a consistent experience |
| Originality and insight | A fresh idea, a clever implementation, or a unique insight |

The organizers' rubric scores each criterion from 1 to 4, and the pitch and demo should aim for the level 4 description in every column.

| Score | Technical depth | Product thinking and impact | Originality and insight | Execution and polish |
| --- | --- | --- | --- | --- |
| 1 | Minimal: a basic app, API wrapper, or template build with little original logic | Unclear: a vague problem and a weak user definition | Generic: a common hackathon idea with no clear twist | Fragile: an unstable demo |
| 2 | Competent: a working build with some custom logic | Defined: a clear target user and a reasonable use case | Familiar: a known idea with small differences | Functional: core features work with rough edges |
| 3 | Strong: clear engineering effort, a non-trivial architecture, and real understanding | Thoughtful: a strong grasp of the user flow and its constraints, with a clear value | Creative: a distinct angle or a clever build | Clean: a smooth demo and a cohesive product |
| 4 | Exceptional: a hard problem solved well, with advanced systems thinking, optimization, custom models or infrastructure, and surprising ambition for 36 hours | Compelling: a sharp problem, a differentiated solution, believable real-world use, and a strong fit with the track | Memorable: a novel framing or insight that stands out from the field | Stage-ready: highly polished, delivered with confidence, and feels like a beta product |

## Devpost event tracks

Each submission picks one of three main tracks, Applied Intelligence, Model Learning, or Beyond the Digital, and must name it in the Devpost description.
Agentverse is not a main track; the team opts into it on Devpost in the same way as a company challenge.
Applied Intelligence is the main track for MCParrot, and Agentverse is a secondary opt-in.

| Track | Fit for MCParrot |
| --- | --- |
| Applied Intelligence | Strong primary fit, because it rewards practical AI that improves everyday work: teach a tool once, then use it from an assistant |
| Agentverse (Fetch.ai) | Strong secondary opt-in, because saved MCP tools can act as agents that turn a request into a result |
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
| Browser Use | Best Use of Browser Use | The user signs in once in a Browser Use cloud browser with a persistent profile, and each ChatGPT tool call runs the saved tool in a hidden Browser Use browser with that profile; when the website signs out, a Browser Use agent signs in again with the saved login through secret bindings, chooses the text-message check, and finishes after the user types the code in ChatGPT; this use is a gap until Nathan's live demonstration passes |
| Sentry | Best Use of Sentry | Requires error monitoring plus at least two other Sentry products, such as Replay, Logs, Tracing, Profiling, Uptime, or AI agent monitoring; MCParrot sends error monitoring, Tracing, Logs, Session Replay, and AI agent monitoring, and the demo must show how that evidence changed what we built, using the three production errors that changed the product, which the [status page](STATUS.md) records |
| Fetch.ai | ASI:One Agent Challenge (Agentverse) | Rewards agents that turn intent into action; it fits only if the demo shows MCP tools registered as agents; Devpost lists $3,000, so confirm the amount on Devpost |

### Secondary sponsor challenges

Pursue these only if the demo supports them.

| Sponsor | Challenge | Notes |
| --- | --- | --- |
| Paper | Best Designed Hack | Judges design fundamentals and craft; the Calm workspace design is the entry; Devpost lists $3,000, so confirm the amount and rules on Devpost and the event site |
| Creao AI | AI-first disruptor, one-person company, or team empowerment | Fits the story that an agent does the work; choose categories when you submit, as the event site describes; Devpost lists a $3,500 category, and the event site may list smaller split tracks, so confirm on Devpost |
| Base44 | Build Something People Want | Needs a real user, a problem-first approach, and a usable product rather than a demo shell; Devpost lists $2,000, so confirm the amount on Devpost |
| Cognition | Best Use of Devin | Applies only if Devin built a meaningful part of the project |

## Other listed prizes

Devpost also lists many MLH category prizes, such as Gemini, Snowflake, ElevenLabs, Vultr, Solana, Tiger Data, and a GoDaddy domain.
It also lists sponsor cash prizes from companies such as Visa, Workday, Even Realities, Espressif, and veri.studio.
Target one of these prizes only if the demo integrates that technology in a meaningful way.
The authoritative prize amounts and rules are in each prize's own description on Devpost and on the event site.
Devpost lists the LA Hacks grand prize amounts as TBD, so confirm them at [ai.lahacks.com](https://ai.lahacks.com).

## Demo planning implications

Prove one complete path before building a wide interface.
The strongest path explores a website once, lets Claude Opus 5.5 through Cursor find what it can do, and chooses a tool.
It then signs in once through Browser Use, adds the app's private connection link to ChatGPT, and asks ChatGPT for a result that the saved tool returns.
This path addresses technical depth and execution better than a polished interface without working features.
Lead with the user and the problem: a student or frequent user stops repeating tedious website navigation.
Canvas is an example of that user's website, not the only one.

Match every demo claim to [the status page](STATUS.md), and label each part as shipped, dormant, aspirational, or a gap.
Judges penalize polish that hides parts that do not work, so never present an aspirational part in the present tense.
Plan the Devpost text, a clean public repository, and a video that shows the same flow that judges see live.
To claim the Sentry prize, show evidence from Tracing, Logs, Replay, or another allowed product, not only caught errors.
The [Sentry diagnostics section](README.md#diagnostics-with-sentry) lists what each product records.
In the demo, open one ChatGPT tool call in Sentry Traces to show its Browser Use and tool request spans, filter Sentry Logs for its tool outcome, and play the dashboard replay of the same session.
Then show the Sentry issue or slow span that led to a change in MCParrot, and the change itself.
To claim the Browser Use prize, show a working web agent and the people it serves.
Show Browser Use in three places: the live view where the user signs in once, including Duo, the hidden browser that runs each tool when ChatGPT calls it, and the agent that signs in again by itself while the user types the text-message code in ChatGPT.

## Organizer pitch guidelines

Every agent who works on the [pitch slideshow](public/docs/pitch.html) or on any other pitch or demo script must follow the guidelines in this section, together with the rubric and timing above.
The main slides must fit the 2-minute science fair pitch, and the whole talk must never pass the 3-minute Round 2 limit; any slides beyond that serve only as backup for questions.
Be direct and concise, and lead with the idea and the product rather than technical depth, because judges ask follow-up questions when they want more detail.
Use many visuals, such as screenshots, diagrams, and numbers, because they make technical complexity easy to see.
Give each slide one idea and few words, keep jargon out of the main slides, and explain any term in plain words on a backup slide.
The pitch slides show status labels only on the slide about next steps.
Rehearse many times, ask other people to judge a practice run, share the talk equally between teammates, and speak with energy rather than in a quiet monotone.

The organizers say that no single formula works, and they suggest two structures:

| Structure | Order of the talk |
| --- | --- |
| Startup pitch | A hook, such as a statistic or a picture, that shows the problem; an overview of how the project solves it and its technology; two or three distinct parts, usually shown in a demo and explained technically; what the team learned and what was hard; and how the team will continue the project |
| Demo path | A story from problem to moment of tension to resolution, told in time order; show the product solving the problem and explain each feature as it appears, rather than giving an abstract overview first |

When judges ask questions, stay calm and respectful, listen to the whole question, and ask them to clarify it when needed.
Pass a technical question to the teammate who knows the answer best, and answer briefly, because judges have little time.
When you do not know an answer, say so honestly and show curiosity, and never argue with a judge.
For help before judging, ask mentors in person or on Discord, use the `#ask-an-organizer` channel, or ask an organizer in person.
