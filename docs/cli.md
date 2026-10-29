# CLI reference

One CLI: `npm run plm -- <command>`. Reads print aligned tables; add `--json` for rows. Writes run in one transaction and roll back on any error. References accept a code, a full name (any case) or the start of the record's id; an ambiguous reference lists the candidates and exits 1.

## Reads

| Command | Returns |
|---|---|
| `attention` | Overdue and undecided samples, fit points out of tolerance, late critical path steps, colour approvals past due or to resubmit, margins under target, rule findings, audits expiring, materials below minimum order. |
| `critical-path` | Every live style: steps done, most overdue step and days late, next step and due date. |
| `late-steps` | Steps late or due in the next 14 days. |
| `samples` | Open samples and those received in the last 60 days, overdue first. |
| `fit-issues` | Measured points outside tolerance. |
| `approvals` | Lab dips, strike-offs, trims and prints waiting. |
| `margins` | Landed cost and margin against target for every style in a live season. |
| `margin-at --fx=<rate> [--currency=USD] [--season=]` | Every current costing re-run at another exchange rate. Nothing saved. |
| `line-plan` | Styles, colourways, units and margin by season and category. |
| `styles`, `seasons`, `factories`, `materials`, `orders` | Lists. |
| `material-demand` | Season demand per material against minimum order. |
| `compliance` | Rule findings, each cited in docs/compliance.md. |
| `style <ref>`, `sample <ref>`, `factory <ref>`, `material <ref>` | One record in full. |

## Writes

| Command | Does |
|---|---|
| `add <type> --data=<file.json>` | Insert a season, factory, material, style, colourway, bom line, spec line, approval or production order. |
| `log <style\|sample\|factory\|approval\|order\|season> <ref> --author= --text=` | Append a note. Notes cannot be edited or deleted. |
| `request-sample <style> --kind= [--size=] [--colourway=] [--factory=] [--due=]` | New sample. Code `<style>-Snn`. Due date defaults to the factory's sample lead time. |
| `receive-sample <sample> [--on=]` | Mark received. |
| `measure <sample> --points=A:54.5,B:72` | Record measurements. A point must exist in the spec for the sample's size. |
| `decide-sample <sample> --status=approved\|rejected --by= [--comments=]` | Decide a received sample. Approving a proto, fit or pp sample completes that step. |
| `decide-approval <approval> --status=approved\|rejected\|resubmit --by= [--comments=]` | Decide a colour or trim approval. When nothing is left waiting on the style, the colour step completes. |
| `cost <style> --fob= --fx= [--freight=] [--duty=] [--currency=] [--factory=] [--note=]` | New costing version; earlier versions become superseded. |
| `agree-costing <style> --by=` | Agree the current quoted costing; completes the costing step. |
| `complete-step <style> --step= --by= [--on=]` | Mark a critical path step done. |
| `set-status <style> --status=` | Move a style's development status. |
| `import delogue --file= [--fx=] [--dry-run]`, `import items --file= [--dry-run]` | See docs/replace-delogue.md. |
| `export --out=<file.json>` | Every table to one file. |
| `draft-weekly`, `draft-sample-comments <sample>` | Markdown drafts in drafts/. Nothing sends. |

## How the numbers are worked out

- **Landed cost** (brand currency, per unit) = FOB x exchange rate + freight + duty, where duty = FOB x exchange rate x duty %. Freight is entered per unit in the brand currency. All rounded to the cent. The duty rate is whatever you record; check your tariff classification with your customs broker.
- **Margin** = (retail excluding GST - landed cost) / retail excluding GST. Retail is stored including GST; GST comes from `plm.settings` (15 by default; set 10 for an Australian brand).
- **Retail needed for target** = landed cost / (1 - target margin), excluding GST.
- **Current costing** is the highest version that is not superseded.
- **Critical path due date** = season launch date - the step's days before launch (`plm.path_steps`). A step is late when it is not done and its due date has passed; "due soon" means within 14 days.
- **Units** for material demand and the line plan are the units on production orders that are not cancelled, or the style's planned units when it has none.
- **Material required** = consumption x (1 + wastage %) x units, summed across live styles in the season.
- **Factory scorecard** covers samples requested in the last 365 days: on time means received on or before the due date.
