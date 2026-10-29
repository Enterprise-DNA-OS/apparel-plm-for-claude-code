# Apparel PLM for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| Command | Use it when the product team asks... |
|---|---|
| /attention | Everything that needs the product team this week: overdue and undecided samples, fit points out of tolerance, late critical path steps, colour approvals, margins under target, rule findings, factory audits and materials below minimum order. |
| /critical-path | Every live style against the critical path: steps done, the most overdue step, what is next and when it is due. |
| /late-steps | Critical path steps that are late or due in the next 14 days, by style. |
| /samples | Samples on order and recent ones: overdue first, then received and waiting for a decision. |
| /sample | One sample in full: style, factory, dates, every measured point against the spec, the decision and notes. |
| /request-sample | Ask a factory for a sample: proto, fit, sales, pre-production or top of production. |
| /receive-sample | Record that a sample has arrived. |
| /measure | Record fit measurements on a received sample and see which points are out of tolerance. |
| /decide-sample | Approve or reject a received sample. An approved proto, fit or pre-production sample completes that step on the critical path. |
| /fit-issues | Every measured point outside the tech pack tolerance, by sample. |
| /draft-sample-comments | Write the comments for one sample to its factory as a message in drafts/: decision, every point out of tolerance and the notes. Nothing sends. |
| /approvals | Lab dips, strike-offs, trims and prints waiting for a decision, overdue first. |
| /decide-approval | Approve, reject or ask for a resubmit on a lab dip, strike-off, trim or print. The last colour approval on a style completes its colour step. |
| /margins | Every costed style's landed cost and margin against its target, worst first, and the styles not yet costed. |
| /margin-at | Re-run every current costing at another exchange rate: what a currency move does to the season's margins. |
| /cost | Record a new costing for a style: FOB, exchange rate, freight and duty. The earlier version is kept as superseded. |
| /agree-costing | Mark a style's current quoted costing as agreed with the factory, which completes the costing step. |
| /line-plan | The season by category: styles, colourways, units, average margin, styles under target and styles not costed. |
| /styles | Live styles with season, category, factory, status, retail, colourways and markets. |
| /style | One style in full: details, colourways, bill of materials with costs, measurements, costing and margin, critical path, samples, approvals, orders, rule findings and notes. |
| /seasons | Seasons with launch date, days to launch, status and number of styles. |
| /factories | The factory scorecard: samples in the last year, on-time rate, average days late, overdue now, rejection rate, social audit and open order units. |
| /factory | One factory in full: details, scorecard, open samples, open orders and notes. |
| /materials | The materials library: fabrics, trims, labels and packaging with composition, supplier, unit cost and minimum order. |
| /material | One material in full: where it is used, how much each style needs, and the season total against the minimum order. |
| /material-demand | What each season needs of every material, from the bills of materials and the units, against the supplier's minimum order. |
| /orders | Production orders with style, colourway, factory, units, FOB, ex-factory date and status. |
| /complete-step | Mark a critical path step done on a style (brief, tech_pack, proto, fit, colour, costing, po, pp, ex_factory, in_store). |
| /set-status | Move a style to another development status (concept, proto, fit, sales_sample, pre_production, approved, in_production, dropped). |
| /compliance | Check every live style and open order against the labelling, children's nightwear and factory rules in docs/compliance.md and report what breaches, with the rule cited. |
| /add | Add a record: season, factory, material, style, colourway, bill of materials line, spec line, approval or production order. |
| /log | Add a note to a style, sample, factory, approval, order or season. Notes are append-only. |
| /import | Bring styles or materials across from a Delogue export (the style list or an item report saved as CSV). |
| /export | Write every record to one JSON file for backup or moving. |
| /weekly-review | The Monday product development review, written from attention, the critical path, samples, margins, rule checks and the factory scorecard. |
| /draft-weekly | Save the weekly review as Markdown in drafts/. Nothing sends. |
| /documents | Render the tech packs, season line sheets and sample comment sheets as branded HTML. |
| /customise | Make this system yours in plain language. Add a field, rename stages, change a rule, add a column to a document. Writes the migration, applies it, updates the commands that touch it. |
| /new-view | Add a read-only HTML view (a dashboard page) from a plain-language description, rendered in the operator's brand by `npm run view`. |

If an ask fits nothing here, run the CLI directly (`npm run plm -- help`) and then propose a new command for it. docs/cli.md says how every number is worked out.

## Hard rules
- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.
- Never invent a measurement, a factory price, an exchange rate, a test result or a fire hazard category. Imports are dry-run first.
- A rule finding is a prompt to check, not legal or testing advice. The nightwear category comes from the laboratory's burn test, recorded here, never decided here.
- Sample decisions and colour approvals carry the name of the person who decided. Factories hear about them from a person, by a drafted message.
- Supplier prices and costings are commercial information. Keep exports and drafts private.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off Delogue.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/delogue
