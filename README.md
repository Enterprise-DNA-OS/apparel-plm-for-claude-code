<h1 align="center">Apparel PLM for Claude Code</h1>

<p align="center">
  <strong>The open-source fashion product development system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Delogue data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=delogue">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/delogue?utm_source=github&utm_medium=readme&utm_campaign=delogue">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-delogue">Instead of Delogue</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Apparel PLM for Claude Code does the job you pay Delogue for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Delogue dashboard cannot.

Delogue publishes its prices: Essential at €145, Professional at €199 and Premium at €249 per user a month on annual billing, excluding VAT, with Premium for teams of 15 or more and a Supplier module at €6,000 a year ([pricing](https://www.delogue.com/pricing), checked 29 October 2026). A 15 person design, product and sourcing team on Professional pays €35,820 a year before the Supplier module. The free code still has hosting, agent and support costs.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=delogue).

It is for fashion, outdoor, footwear and homeware brands in New Zealand and Australia with roughly 5 to 50 people in design, product and sourcing, who design here and make offshore. It keeps seasons, styles, colourways, bills of materials, measurement specs, samples and fit measurements, lab dips and strike-offs, factory costings with landed cost and margin, a critical path counted back from each season's launch, production orders and a factory scorecard. It checks every style against the New Zealand fibre content and care labelling regulations, the Australian care labelling standard and the children's nightwear fire hazard standards, with each rule cited in [docs/compliance.md](docs/compliance.md).

The demo is a fictional Auckland outdoor label, Southerly Outfitters, three weeks into fit for Autumn Winter 2027. It has a proto sample 39 days overdue, a fit sample 2.5 cm wide in the chest, a shell jacket under margin after a hood change, kids pyjamas with no fire hazard category and another with the wrong label, a trouser whose fibre content adds to 101%, a factory whose social audit expires before its order ships, a fleece already in bulk without an approved pre-production sample, and an insulation order below the mill's minimum.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/apparel-plm-for-claude-code.git
cd apparel-plm-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`. Follow it with `/critical-path`, `/margins` and `/compliance`.

Or from the terminal:

```bash
npm test
npm run plm -- critical-path
npm run view
npm run docs
```

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
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

`npm run view` renders three read-only pages in your brand: this week (critical path, samples, fit, colour, margins, rule checks), the season line plan with material demand, and the factory scorecard. `npm run docs` renders a tech pack per style, a line sheet per season and a comment sheet per recent sample.

## Ten questions to ask it

These run against the free version today. Delogue has its own reports; the difference here is that you own the records and the rules, and you ask in your own words.

1. Which styles are behind on the critical path, and which step is holding each one up? (`/critical-path`)
2. Which samples are overdue from which factory, and by how many days? (`/samples`)
3. Which points on the last fit sample are outside tolerance, and by how much? (`/sample`, `/fit-issues`)
4. Which styles are under our target margin at today's costings, and what retail would fix each? (`/margins`, `/style`)
5. If the dollar drops to 1.85, which styles fall under target? (`/margin-at`)
6. Which styles sold in New Zealand are missing fibre content or English care instructions? (`/compliance`)
7. Which kids nightwear has no fire hazard category, the wrong label, or no burn test on file? (`/compliance`)
8. Which factory is late most often with samples, and whose social audit runs out before our order ships? (`/factories`)
9. How many metres of each fabric does the season need, and is any order below the mill's minimum? (`/material-demand`)
10. Is anything in bulk production without an approved pre-production sample? (`/compliance`, `/orders`)

## Your first hour: ten things to ask for

1. Put our name, logo and colours on the tech packs and line sheets.
2. Set our currency and GST rate, and our target margin.
3. Add this season and next with their launch dates.
4. Add our factories with their sample lead times and audit dates.
5. Import our styles and items from the Delogue export and check them.
6. Change the critical path steps and lead times to how we actually work.
7. Load the measurement chart for our best seller and request a fit sample.
8. Show me every style under margin at a rate of 1.80.
9. Check every style's labels against the New Zealand and Australian rules.
10. Draft the Monday product review for the team.

## Instead of Delogue

Add your seasons and factories, export your style list and an item report from Delogue to Excel, save them as CSV, check the columns, and import with a dry run first:

```bash
npm run plm -- import delogue --file=examples/delogue-styles.csv --fx=1.70 --dry-run
npm run plm -- import delogue --file=examples/delogue-styles.csv --fx=1.70
npm run plm -- import items --file=examples/delogue-items.csv --dry-run
```

The example files are illustrative, not real exports. Identical rows are skipped on a repeat; a style or item number that already exists stops the whole file. Bills of materials, measurement charts, sample history and artwork do not carry over automatically. The full guide, including what does not come across: [docs/replace-delogue.md](docs/replace-delogue.md).

## Validation

`npm test` runs against a temporary database and clears any inherited `DATABASE_URL`, so it cannot touch live data. It checks the landed cost and margin by hand, the exchange rate rerun, the critical path dates, every rule, the sample, measurement, colour and costing writes and their failure cases, the imports (dry run, repeat, clash, missing season), export, drafts, views and documents. Set `TEST_DATABASE_URL` to an empty disposable PostgreSQL database for a parity run. The suite uses Node APIs only and runs on Windows and Linux; `.github/workflows/ci.yml` has both.

Money is in cents. Retail prices include GST; costings keep the factory's currency and the exchange rate you costed at. Supplier prices are commercial information: never publish an export.

Delogue is a trademark of its owner. This independent project is not affiliated with Delogue.

## Architecture

```
apparel-plm-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     compliance rules, CLI reference, switch guide, evidence runs
  views.json documents.json the HTML pages and paperwork, from SQL
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Apparel PLM for Claude Code for your business, migrates your Delogue data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=delogue)
- Read more: [enterprisedna.co/omni/instead-of/delogue](https://enterprisedna.co/omni/instead-of/delogue?utm_source=github&utm_medium=readme&utm_campaign=delogue)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
