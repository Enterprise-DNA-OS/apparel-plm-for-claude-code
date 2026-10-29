# Moving from Delogue

Delogue keeps styles, items (fabrics, trims and labels), colours, measurement charts, samples and prices. You can get them out three ways: an item custom report exported to Excel, the style export under Admin > Import/export (XML, admin only), and the custom export over Delogue's REST web service. This base imports CSV, so the simplest path is a style list and an item report saved from Excel as CSV. Test the import, then run both side by side for one sample round before you stop paying.

## 1. Seasons and factories first

Add each season and factory with `/add` (types `seasons` and `factories`) using the codes or names your export uses. The import matches a style's season and supplier by code or name, and stops if one is missing.

## 2. Styles

Export your style list to Excel and save it as CSV. Column names depend on how your account is set up, so check them against this list. Each field accepts any of the names shown (case does not matter):

| Field | Accepted column names |
|---|---|
| style number | Style No, Style No., Style Number, Style, Style Code |
| name | Style Name, Name, Description |
| season | Season |
| category | Category, Product Type, Product Group, Style Type |
| department | Gender, Department, Target Group (women, men, unisex, kids) |
| factory | Supplier, Vendor, Factory |
| designer | Designer, Responsible, Owner |
| retail price | Retail Price, RRP, Sales Price, Recommended Retail Price (including GST) |
| purchase price | Purchase Price, FOB, FOB Price, Cost Price |
| purchase currency | Purchase Currency, Currency (USD if blank) |
| fibre content | Composition, Fibre Content, Fiber Content, Main Composition. Separate parts with a semicolon. |
| care | Care Instructions, Care, Care Text |
| origin | Country of Origin, Origin, COO |
| colours | Colours, Colors, Colourways, Colorways, separated by ; or \| or / |
| sizes | Size Range, Sizes |

Rename a column in the CSV if yours differs, or ask Claude Code to add the alias. A file with purchase prices needs the exchange rate you want them costed at:

```bash
npm run plm -- import delogue --file=imports/styles.csv --fx=1.70 --dry-run
npm run plm -- import delogue --file=imports/styles.csv --fx=1.70
npm run plm -- margins
```

The example in `examples/delogue-styles.csv` is illustrative, not a real export. The dry run reads every row and rolls back. Identical rows are skipped on a repeat. A style number that already exists stops the whole file: nothing is imported until it is fixed.

## 3. Items (materials)

Export an item custom report (one item per row) to Excel and save it as CSV.

| Field | Accepted column names |
|---|---|
| item number | Item No, Item No., Item Number, Item, Item Code |
| name | Item Name, Name, Description |
| type | Item Type, Type, Category, Item Category (fabric, label and packaging are recognised; anything else is a trim) |
| composition | Composition, Fibre Content, Fiber Content |
| supplier | Supplier, Vendor |
| unit | Unit, UOM, Unit of Measure (m, yd, pc, set, kg, cone) |
| price | Price, Purchase Price, Cost, Unit Price |
| currency | Currency, Purchase Currency |
| minimum order | MOQ, Minimum Order, Minimum Order Quantity |

```bash
npm run plm -- import items --file=imports/items.csv --dry-run
npm run plm -- import items --file=imports/items.csv
```

## What does not come across on its own

- **Bills of materials.** Delogue's "Expand used in styles" report layout lists the styles each item is used in. Add the lines with `/add` (type `bom_lines`), or ask Claude Code to map that report.
- **Measurement charts.** Export the size chart per style and add spec lines (`/add`, type `spec_lines`), or ask Claude Code to map the export.
- **Sample history, comments and files.** Bring open samples across by hand with `/request-sample`. Keep closed history in Delogue's export or your drive.
- **Sketches, artwork and attachments.** These stay as files. Link them in a note.
- **Care symbols and multi-language compositions.** Write the English care text into the style; symbols go in `care_symbols` as text.

Enterprise DNA maps the rest as part of a set-up: your columns, your measurement charts and your bills of materials, checked against Delogue before you switch.

Delogue is a trademark of its owner. This independent project is not affiliated with Delogue.
