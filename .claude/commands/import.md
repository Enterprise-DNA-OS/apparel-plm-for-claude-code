---
description: Bring styles or materials across from a Delogue export (the style list or an item report saved as CSV).
---

Read docs/replace-delogue.md. Check the file's columns against the accepted names. Run `npm run plm -- import delogue --file=imports/<file>.csv --fx=<rate> --dry-run` (or `import items`), show the counts, then repeat without --dry-run. A style that already exists stops the whole file.
