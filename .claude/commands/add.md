---
description: Add a record: season, factory, material, style, colourway, bill of materials line, spec line, approval or production order.
---

Read docs/cli.md and the migration. Put the supplied fields in a private JSON file under imports/, then run `npm run plm -- add <type> --data=imports/record.json`. Codes are accepted for season_id, factory_id, style_id, material_id and colourway_id. Read the record back. Never invent a price or measurement.
