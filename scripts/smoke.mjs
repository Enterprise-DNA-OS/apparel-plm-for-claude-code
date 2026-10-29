// npm test: a temporary database, every command, the rules and the edge cases. Never touches a live database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { seed } from './seed.mjs';
import { run, READS, TABLES, date, cents, mapStyleRow } from './plm.mjs';
import { parseCsv } from './lib/csv.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-test-'));
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || '';
process.env.DATA_DIR = path.join(temp, 'db');
process.env.OUTPUT_DIR = temp;
let db; let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg); checks++; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); checks++; };
const rejects = async (fn, re) => { await assert.rejects(fn, re); checks++; };
const file = (name, v) => { const f = path.join(temp, `${name}.json`); fs.writeFileSync(f, JSON.stringify(v)); return `--data=${f}`; };
function cli(script, args = []) {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', script), ...args], { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout); checks++;
  return r.stdout;
}
const one = async (sql, p = []) => (await db.query(sql, p))[0];

try {
  db = await getDb();
  await migrate(db);
  eq((await migrate(db)).ran.length, 0, 'repeat migration is a no-op');
  await seed(db); await seed(db);
  eq((await run(db, ['styles'])).length, 14, 'seed is idempotent (dropped style hidden)');
  eq((await one('select count(*)::int n from plm.notes')).n, 3, 'notes seeded once');

  // Every read runs.
  for (const c of Object.keys(READS)) ok(Array.isArray(await run(db, [c])), c);
  ok(Array.isArray(await run(db, ['margin-at', '--fx=1.85'])), 'margin-at');
  const help = await run(db, ['help']);
  eq(help.reads.length, Object.keys(READS).length + 2, 'help lists every read');

  // Landed cost and margin, worked by hand: SO-101 FOB USD 16.50 at 1.70, NZD 1.20 freight, 10% duty, NZD 129 incl 15% GST.
  const c101 = await one("select landed_cents, retail_ex_gst_cents, margin_pct from plm.style_cost where code = 'SO-101'");
  eq(c101.landed_cents, 2805 + 120 + 281, 'landed cost = FOB x rate + freight + duty');
  eq(c101.retail_ex_gst_cents, 11217, 'retail excluding GST');
  eq(Number(c101.margin_pct), 71.4, 'margin');
  const m = await run(db, ['margins']);
  eq(m.filter((r) => r.flag === 'UNDER TARGET').map((r) => r.code).sort().join(','), 'SO-201,SO-401,SO-402', 'three styles under target');
  ok(m.some((r) => r.code === 'SO-601' && r.flag === 'NOT COSTED'), 'uncosted style flagged');
  eq((await one("select version from plm.style_cost where code = 'SO-201'")).version, 2, 'superseded costing ignored');
  const fx = await run(db, ['margin-at', '--fx=1.85']);
  ok(fx.find((r) => r.code === 'SO-202').flag === 'UNDER TARGET', 'a weaker dollar pushes the vest under target');
  ok(fx.every((r) => Number(r.margin_new) < Number(r.margin_now)), 'every margin falls at a weaker rate');
  eq((await run(db, ['margin-at', '--fx=1.85', '--currency=EUR'])).length, 0, 'currency filter');
  await rejects(() => run(db, ['margin-at', '--fx=0']), /positive/);

  // Critical path: due dates count back from launch; late and done are right.
  const cp = await one("select due_on, state, days_late from plm.critical_path where style = 'SO-102' and step = 'tech_pack'");
  eq(cp.state, 'late', 'missed tech pack is late');
  eq(cp.days_late, 60, 'days late from launch minus 180');
  eq((await run(db, ['critical-path']))[0].days_late, 60, 'most behind first');
  ok(!(await db.query("select 1 from plm.critical_path where style = 'SO-701'")).length, 'dropped styles leave the path');

  // The deliberate problems are all found, with their rules.
  const rules = new Set((await run(db, ['compliance'])).map((r) => r.rule));
  for (const r of ['nz-fibre-content', 'fibre-total', 'nz-care-english', 'au-care-label', 'nightwear-category', 'nightwear-label', 'nightwear-test', 'factory-audit', 'pp-before-bulk'])
    ok(rules.has(r), `rule ${r} found`);
  ok(!(await run(db, ['compliance'])).some((r) => r.style === 'SO-202'), 'shell and fill parts each add to 100');
  eq((await run(db, ['samples'])).filter((r) => r.flag === 'OVERDUE').length, 3, 'three samples overdue');
  eq((await run(db, ['fit-issues'])).length, 3, 'three points out of tolerance');
  eq((await run(db, ['approvals'])).length, 4, 'four colour approvals waiting');
  ok((await run(db, ['material-demand'])).some((r) => r.code === 'T-INS' && r.flag === 'below MOQ'), 'material below MOQ');
  const f = await run(db, ['factories']);
  eq(f.find((r) => r.code === 'DHW').on_time_pct, '60', 'factory on-time rate');
  const att = await run(db, ['attention']);
  for (const a of ['samples', 'fit', 'critical path', 'colour', 'margin', 'rules', 'factory', 'materials']) ok(att.some((i) => i.area === a), `attention covers ${a}`);

  // Lookups: case-insensitive names, partial ids, ambiguity lists candidates.
  eq((await run(db, ['style', 'merino crew tee'])).style.code, 'SO-101', 'case-insensitive name');
  const id = (await one("select id from plm.styles where code = 'SO-101'")).id;
  eq((await run(db, ['style', id.slice(0, 8)])).style.code, 'SO-101', 'partial id');
  await rejects(() => run(db, ['style', 'merino']), /Ambiguous styles/);
  await rejects(() => run(db, ['style', 'nobody']), /No styles/);
  await rejects(() => run(db, ['styles', '--typo']), /Unknown option/);
  await rejects(() => run(db, ['styles', 'extra']), /Unexpected/);
  await rejects(() => run(db, ['nonsense']), /Unknown command/);
  ok((await run(db, ['material', 'F-MER'])).where_used.length === 3, 'where used');
  ok((await run(db, ['factory', 'HCM'])).open_samples.length === 2, 'factory detail');
  eq((await run(db, ['sample', 'SA-102'])).measurements.find((r) => r.pom === 'A').result, 'OUT', 'sample measured against spec');
  assert.throws(() => date('2026-02-30')); checks++;
  eq(cents('$1,249.50'), 124950, 'amount with symbol and comma'); eq(cents('NZD 129'), 12900, 'amount with currency');
  assert.throws(() => cents('12.345')); checks++;
  ok(parseCsv('﻿A,B\r\n"a,b","line\nwith ""quotes"""')[0].B === 'line\nwith "quotes"', 'CSV quoting');

  // Writes: sample request, receive, measure, decide; the critical path follows.
  const rq = await run(db, ['request-sample', 'SO-202', '--kind=fit', '--size=M', '--colourway=Moss']);
  eq(rq.code, 'SO-202-S01', 'sample code');
  eq((await one("select due_on - requested_on d from plm.samples where code = 'SO-202-S01'")).d, 25, 'due date from factory lead time');
  await rejects(() => run(db, ['request-sample', 'SO-202', '--kind=fit', '--colourway=Purple']), /No colourway/);
  await rejects(() => run(db, ['request-sample', 'SO-202', '--kind=photo']), /--kind/);
  await rejects(() => run(db, ['measure', 'SO-202-S01', '--points=A:60']), /not been received/);
  await rejects(() => run(db, ['decide-sample', 'SO-202-S01', '--status=approved', '--by=Tom']), /must be received/);
  const rc = await run(db, ['receive-sample', 'SA-202']);
  eq(rc.days_late, 9, 'received late');
  await rejects(() => run(db, ['receive-sample', 'SA-202']), /not waiting/);
  const ms = await run(db, ['measure', 'SA-202', '--points=A:60.4,B:78.0,C:88.0']);
  eq(ms.out_of_tolerance.length, 1, 'one point out');
  await rejects(() => run(db, ['measure', 'SA-202', '--points=Z:10']), /No spec/);
  await rejects(() => run(db, ['measure', 'SA-202', '--points=A=60']), /Cannot read/);
  await run(db, ['measure', 'SA-202', '--points=B:76.5']);
  eq((await run(db, ['fit-issues'])).filter((r) => r.sample === 'SA-202').length, 0, 're-measure replaces the point');
  const dec = await run(db, ['decide-sample', 'SA-202', '--status=approved', '--by=Tom Reeve', '--comments=Fit approved']);
  eq(dec.critical_path_step_done, 'fit', 'approved fit sample completes the fit step');
  eq((await one("select state from plm.critical_path where style = 'SO-201' and step = 'fit'")).state, 'done', 'path shows fit done');
  const dr = await run(db, ['draft-sample-comments', 'SA-301']);
  ok(fs.readFileSync(dr.draft, 'utf8').startsWith('Hi Rahim') && dr.points_out === 2, 'sample comments drafted for the factory');
  await rejects(() => run(db, ['draft-sample-comments', 'SA-302']), /not been received/);

  const ap = await run(db, ['decide-approval', 'AP-201', '--status=approved', '--by=Tom Reeve']);
  eq(ap.colour_step_done, true, 'last colour approval completes the colour step');
  await rejects(() => run(db, ['decide-approval', 'AP-201', '--status=approved', '--by=Tom Reeve']), /already been decided/);
  await rejects(() => run(db, ['decide-approval', 'AP-101', '--status=maybe', '--by=x']), /--status/);

  // Costing: a new version supersedes, the margin is returned, agreeing completes the step.
  const cst = await run(db, ['cost', 'SO-201', '--fob=41.00', '--fx=1.70', '--freight=2.50', '--duty=10', '--note=Dropped laminated peak']);
  eq(cst.version, 3, 'new costing version');
  ok(Number(cst.margin_pct) > 58.7, 'cheaper FOB lifts margin');
  eq((await one("select count(*)::int n from plm.costings c join plm.styles s on s.id = c.style_id where s.code = 'SO-201' and c.status <> 'superseded'")).n, 1, 'one live costing');
  await rejects(() => run(db, ['cost', 'SO-201', '--fob=abc', '--fx=1.7']), /not an amount/);
  const ag = await run(db, ['agree-costing', 'SO-201', '--by=Tom Reeve']);
  eq(ag.agreed_version, 3, 'costing agreed');
  await rejects(() => run(db, ['agree-costing', 'SO-201', '--by=Tom Reeve']), /no quoted costing/);
  eq((await one("select state from plm.critical_path where style = 'SO-201' and step = 'costing'")).state, 'done', 'costing step done');

  const st = await run(db, ['complete-step', 'SO-102', '--step=tech_pack', '--by=Hana Kim']);
  eq(st.step, 'tech_pack', 'step completed');
  await rejects(() => run(db, ['complete-step', 'SO-102', '--step=tech_pack', '--by=Hana Kim']), /already/);
  await rejects(() => run(db, ['complete-step', 'SO-102', '--step=nap', '--by=Hana Kim']), /Unknown step/);

  // Fixing the records clears the findings.
  await db.query("update plm.styles set fibre_content = '97% organic cotton, 3% elastane' where code = 'SO-301'");
  await db.query("update plm.styles set fire_label = 'low' where code = 'SO-402'");
  const after = new Set((await run(db, ['compliance'])).map((r) => r.rule));
  ok(!after.has('fibre-total') && !after.has('nightwear-label'), 'corrected labels clear their findings');

  await run(db, ['add', 'seasons', file('se', { code: 'TST', name: 'Test season', launch_on: '2030-03-01' })]);
  await run(db, ['add', 'styles', file('st', { code: 'T-1', name: 'Test Tee', season_id: 'TST', category: 'tees', factory_id: 'DHW', retail_cents: 5000, markets: ['NZ'] })]);
  await run(db, ['add', 'colourways', file('cw', { style_id: 'T-1', code: 'WHT', name: 'White' })]);
  await run(db, ['add', 'bom_lines', file('bl', { style_id: 'T-1', material_id: 'F-COT', placement: 'Body', consumption: 1.2 })]);
  await rejects(() => run(db, ['add', 'styles', file('st2', { code: 'T-2', name: 'x', season_id: 'TST', category: 'x', markets: ['UK'] })]), /check/);
  await rejects(() => run(db, ['add', 'styles', file('st3', { code: 'T-3', bogus: 1 })]), /Unknown field/);
  await rejects(() => run(db, ['add', 'production_orders', file('po', { code: 'PO-X', style_id: 'T-1', colourway_id: 'KWK', factory_id: 'DHW', units: 10, fob_cents: 100, ex_factory_on: '2030-01-01' })]), /No colourway/);
  ok((await run(db, ['compliance'])).some((r) => r.style === 'T-1' && r.rule === 'nz-fibre-content'), 'new style checked');

  const note = await run(db, ['log', 'style', 'SO-201', '--author=Tom Reeve', '--text=Costing agreed at 41.']);
  eq(note.logged, 'SO-201', 'note logged');
  await rejects(() => db.query("update plm.notes set body = 'changed'"), /append-only/);

  // Imports: dry run rolls back, a repeat skips, a clash stops the whole file.
  const styles = path.join(REPO_ROOT, 'examples', 'delogue-styles.csv');
  await rejects(() => run(db, ['import', 'delogue', `--file=${styles}`]), /--fx/);
  const dry = await run(db, ['import', 'delogue', `--file=${styles}`, '--fx=1.70', '--dry-run']);
  eq(dry.inserted, 3, 'dry run counts rows');
  eq((await one("select count(*)::int n from plm.styles where code like 'SO-90_' and code <> 'SO-090'")).n, 0, 'dry run rolled back');
  const imp = await run(db, ['import', 'delogue', `--file=${styles}`, '--fx=1.70']);
  ok(imp.inserted === 3 && imp.colourways === 5 && imp.costings === 2, 'styles, colourways and costings imported');
  eq((await run(db, ['import', 'delogue', `--file=${styles}`, '--fx=1.70'])).skipped_identical, 3, 'repeat import skips');
  eq((await one("select f.code from plm.styles s join plm.factories f on f.id = s.factory_id where s.code = 'SO-902'")).code, 'DHW', 'supplier matched by name');
  ok(!(await run(db, ['compliance'])).some((r) => r.style === 'SO-902' && r.rule === 'fibre-total'), 'imported two-part composition passes');
  const clash = path.join(temp, 'clash.csv');
  fs.writeFileSync(clash, 'Style No,Style Name,Season\nSO-950,New Style,AW27\nSO-101,Merino Crew Tee,AW27\n');
  await rejects(() => run(db, ['import', 'delogue', `--file=${clash}`]), /already exists/);
  eq((await one("select count(*)::int n from plm.styles where code = 'SO-950'")).n, 0, 'clash stopped the whole import');
  const noSeason = path.join(temp, 'noseason.csv');
  fs.writeFileSync(noSeason, 'Style No,Style Name,Season\nSO-951,New Style,SS30\n');
  await rejects(() => run(db, ['import', 'delogue', `--file=${noSeason}`]), /Add the season first/);
  assert.throws(() => mapStyleRow({ 'Style No': 'X', Season: 'AW27' }, 2), /required/); checks++;
  const items = path.join(REPO_ROOT, 'examples', 'delogue-items.csv');
  const it = await run(db, ['import', 'items', `--file=${items}`]);
  eq(it.inserted, 3, 'items imported');
  eq((await one("select unit, kind, moq from plm.materials where code = 'F-RIB'")).unit, 'm', 'unit mapped');
  eq((await one("select kind from plm.materials where code = 'L-HNG'")).kind, 'label', 'type mapped');

  // Export, drafts, views and documents.
  const exp = await run(db, ['export', `--out=${path.join(temp, 'exports', 'backup.json')}`]);
  ok(TABLES.every((t) => t in exp.counts) && exp.counts.styles > 14, 'export has every table');
  const wk = await run(db, ['draft-weekly']);
  ok(fs.readFileSync(wk.draft, 'utf8').includes('## Critical path'), 'weekly draft written');
  await db.close(); db = null;
  ok(cli('view.mjs').includes('views/week.html'), 'views render');
  const docs = cli('docs.mjs');
  ok(/\d+ document\(s\) rendered/.test(docs) && docs.includes('tech-pack') && docs.includes('line-sheet'), 'documents render');
  ok(cli('plm.mjs', ['compliance', '--json']).trim().startsWith('['), 'json output');
  console.log(`PASS ${checks} checks (${process.env.DATABASE_URL ? 'postgres' : 'pglite'})`);
} finally {
  if (db) await db.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
