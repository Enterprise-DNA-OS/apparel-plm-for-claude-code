#!/usr/bin/env node
// The one CLI. Every slash command drives this file.
//   npm run plm -- help
//   npm run plm -- critical-path [--json]
// Reads print aligned tables; --json prints rows for machines. Writes run in one transaction.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table } from './lib/format.mjs';

export const TABLES = ['settings', 'seasons', 'factories', 'materials', 'styles', 'colourways', 'bom_lines', 'spec_lines', 'samples',
  'fit_measurements', 'approvals', 'costings', 'path_steps', 'milestones', 'production_orders', 'notes', 'import_rows'];

const money = (col, cur = "(select brand_currency from plm.settings)") => `case when ${col} is null then null else ${cur} || ' ' || to_char(${col} / 100.0, 'FM999G999G990D00') end`;
export const READS = {
  seasons: `select se.code, se.name, se.launch_on, se.launch_on - current_date days_to_launch, se.status,
    (select count(*) from plm.styles s where s.season_id = se.id and s.status <> 'dropped')::int styles
    from plm.seasons se order by se.launch_on`,
  styles: `select s.code, s.name, se.code season, s.category, coalesce(f.code, '') factory, replace(s.status, '_', ' ') status,
    ${money('s.retail_cents')} retail, (select count(*) from plm.colourways c where c.style_id = s.id and c.status = 'active')::int colourways,
    array_to_string(s.markets, ' ') markets
    from plm.styles s join plm.seasons se on se.id = s.season_id left join plm.factories f on f.id = s.factory_id
    where s.status <> 'dropped' order by se.launch_on, s.code`,
  'line-plan': `select season, category, styles, colourways, units, avg_margin_pct, under_target, not_costed from plm.line_plan
    order by (select launch_on from plm.seasons where code = season), category`,
  'critical-path': `select style, name, season, coalesce(factory, '') factory, steps_done || '/' || steps done, coalesce(worst_days_late, 0) days_late,
    coalesce(first_late_step, '') late_step, next_step, next_due from plm.style_progress
    order by coalesce(worst_days_late, 0) desc, next_due, style`,
  'late-steps': `select style, name, season, factory, step_name step, due_on, days_late, state from plm.critical_path
    where state in ('late','due soon') order by state = 'late' desc, days_late desc, due_on, style`,
  samples: `select code, style, name, coalesce(colourway, '') colourway, factory, kind, coalesce(size, '') size, due_on,
    coalesce(received_on::text, '') received_on, status, days_overdue,
    case when days_overdue > 0 then 'OVERDUE' when status = 'received' then 'DECIDE' else '' end flag
    from plm.sample_status where status not in ('cancelled') and (status in ('requested','received') or received_on >= current_date - 60)
    order by (status = 'requested' and days_overdue > 0) desc, (status = 'received') desc, due_on, code`,
  'fit-issues': `select sample, style, name, kind, size, pom_code pom, description, spec_cm, measured_cm, off_by_cm, tolerance_cm, sample_status
    from plm.fit_issues order by sample, pom_code`,
  approvals: `select code, style, name, coalesce(colourway, '') colourway, replace(kind, '_', ' ') kind, submitted_on, due_on, status,
    days_waiting, days_overdue, coalesce(comments, '') comments from plm.approvals_waiting order by days_overdue desc, due_on`,
  margins: `select code, name, season, category, ${money('retail_cents')} retail, ${money('landed_cents')} landed,
    margin_pct, target_margin_pct target, margin_gap_pct gap, coalesce(costing_status, 'not costed') costing,
    case when landed_cents is null then 'NOT COSTED' when margin_gap_pct < 0 then 'UNDER TARGET' else '' end flag
    from plm.style_cost where season in (select code from plm.seasons where status not in ('launched','closed'))
    order by landed_cents is null, margin_gap_pct, code`,
  factories: `select code, name, country, samples, received, on_time_pct, avg_days_late, overdue_now, rejected_pct,
    coalesce(audit_scheme, '') audit, audit_expires_on, open_order_units from plm.factory_scorecard order by code`,
  materials: `select code, name, kind, coalesce(composition, '') composition, coalesce(supplier, '') supplier, unit,
    ${money('unit_cost_cents', 'currency')} unit_cost, moq from plm.materials order by kind, code`,
  'material-demand': `select code, name, unit, supplier, season, styles, required, moq, flag from plm.material_demand
    order by season, flag desc, code`,
  orders: `select o.code, s.code style, s.name, coalesce(c.code, '') colourway, f.code factory, o.units, ${money('o.fob_cents', 'o.currency')} fob,
    o.ex_factory_on, replace(o.status, '_', ' ') status
    from plm.production_orders o join plm.styles s on s.id = o.style_id join plm.factories f on f.id = o.factory_id
    left join plm.colourways c on c.id = o.colourway_id where o.status <> 'cancelled' order by o.ex_factory_on, o.code`,
  compliance: `select rule, style, name, season, detail from plm.compliance_findings order by rule, style`,
};

const OPTION_READS = {
  // Re-run every current costing at another exchange rate: what a currency move does to margin.
  'margin-at': { opts: ['fx', 'currency', 'season'], run: async (db, o) => {
    const fx = Number(need(o, 'fx'));
    if (!Number.isFinite(fx) || fx <= 0) throw Error('--fx must be a positive rate (brand currency per one unit of the FOB currency)');
    return db.query(`select code, name, season, fob_currency, fx_rate fx_now, $1::numeric fx_new, margin_pct margin_now,
      round(100.0 * (retail_ex_gst_cents - new_landed) / retail_ex_gst_cents, 1) margin_new, target_margin_pct target,
      case when round(100.0 * (retail_ex_gst_cents - new_landed) / retail_ex_gst_cents, 1) < target_margin_pct then 'UNDER TARGET' else '' end flag
      from (select sc.*, (round(fob_cents * $1::numeric) + freight_cents + round(fob_cents * $1::numeric * duty_pct / 100))::int new_landed
        from plm.style_cost sc where landed_cents is not null and upper(fob_currency) = upper($2)
        and ($3 = '' or lower(season) = lower($3)) and season in (select code from plm.seasons where status not in ('launched','closed'))) x
      order by margin_new, code`, [fx, o.currency || 'USD', o.season || '']);
  } },
};

const ADD_FIELDS = {
  seasons: ['code', 'name', 'launch_on', 'status'],
  factories: ['code', 'name', 'country', 'contact', 'email', 'speciality', 'audit_scheme', 'audit_expires_on', 'sample_lead_days', 'active'],
  materials: ['code', 'name', 'kind', 'composition', 'supplier', 'unit', 'unit_cost_cents', 'currency', 'moq'],
  styles: ['code', 'name', 'season_id', 'category', 'department', 'factory_id', 'designer', 'status', 'retail_cents', 'target_margin_pct', 'planned_units',
    'size_range', 'markets', 'fibre_content', 'care_instructions', 'care_symbols', 'origin', 'childrens_nightwear', 'nightwear_category', 'fire_label', 'nightwear_test_ref'],
  colourways: ['style_id', 'code', 'name', 'status'],
  bom_lines: ['style_id', 'material_id', 'placement', 'consumption', 'wastage_pct'],
  spec_lines: ['style_id', 'pom_code', 'description', 'size', 'spec_cm', 'tolerance_cm'],
  approvals: ['code', 'style_id', 'colourway_id', 'kind', 'submitted_on', 'due_on'],
  production_orders: ['code', 'style_id', 'colourway_id', 'factory_id', 'units', 'fob_cents', 'currency', 'placed_on', 'ex_factory_on', 'status'],
};
const REFS = { season_id: 'seasons', factory_id: 'factories', style_id: 'styles', material_id: 'materials' };
const LOOKUP = {
  seasons: { label: 'seasons', sql: 'select id, code, name from plm.seasons' },
  factories: { label: 'factories', sql: 'select id, code, name from plm.factories' },
  materials: { label: 'materials', sql: 'select id, code, name from plm.materials' },
  styles: { label: 'styles', sql: 'select id, code, name from plm.styles' },
  samples: { label: 'samples', sql: 'select id, code, code as name from plm.samples' },
  approvals: { label: 'approvals', sql: 'select id, code, code as name from plm.approvals' },
  orders: { label: 'production orders', sql: 'select id, code, code as name from plm.production_orders' },
};
const SAMPLE_STEP = { proto: 'proto', fit: 'fit', pp: 'pp' };

const HELP = {
  reads: [...Object.keys(READS), ...Object.keys(OPTION_READS), 'attention'].sort(),
  details: ['style <ref>', 'sample <ref>', 'factory <ref>', 'material <ref>'],
  writes: ['add <type> --data=<file.json>', 'log <style|sample|factory|approval|order|season> <ref> --author= --text=',
    'request-sample <style> --kind=proto|fit|sales|pp|top [--size=] [--colourway=] [--factory=] [--due=YYYY-MM-DD]',
    'receive-sample <sample> [--on=YYYY-MM-DD]', 'measure <sample> --points=A:54.5,B:72',
    'decide-sample <sample> --status=approved|rejected --by= [--comments=]',
    'decide-approval <approval> --status=approved|rejected|resubmit --by= [--comments=]',
    'complete-step <style> --step=<code> --by= [--on=YYYY-MM-DD]',
    'cost <style> --fob=<amount> --fx=<rate> [--freight=<amount>] [--duty=<pct>] [--currency=USD] [--factory=] [--note=]',
    'agree-costing <style> --by=', 'set-status <style> --status=',
    'import delogue --file=<csv> [--fx=<rate>] [--dry-run]', 'import items --file=<csv> [--dry-run]',
    'export --out=<file.json>', 'draft-weekly', 'draft-sample-comments <sample>'],
};

// ------------------------------------------------------------------ helpers
export function date(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw Error(`Invalid date "${v}". Use YYYY-MM-DD.`);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw Error(`Invalid date "${v}".`);
  return v;
}
// "129", "129.00", "$1,249.50", "NZD 129" -> cents
export function cents(v, label = 'amount') {
  const s = String(v ?? '').trim().replace(/^[A-Z]{3}\s*/i, '').replace(/^[$€£¥]/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw Error(`${label} "${v}" is not an amount. Use 129 or 129.50.`);
  return Math.round(Number(s) * 100);
}
function parseArgs(args) {
  const pos = []; const opts = {};
  for (const a of args) {
    if (a.startsWith('--')) { const eq = a.indexOf('='); opts[eq < 0 ? a.slice(2) : a.slice(2, eq)] = eq < 0 ? true : a.slice(eq + 1); }
    else pos.push(a);
  }
  return { pos, opts };
}
function allow(opts, names) {
  for (const k of Object.keys(opts)) if (!['json', ...names].includes(k)) throw Error(`Unknown option --${k}`);
}
function need(opts, k) { if (opts[k] === undefined || opts[k] === true || String(opts[k]).trim() === '') throw Error(`--${k} is required`); return String(opts[k]).trim(); }
function noExtra(pos, n) { if (pos.length > n) throw Error(`Unexpected argument "${pos[n]}"`); }
function oneOf(v, list, label) { if (!list.includes(v)) throw Error(`${label} must be one of: ${list.join(', ')}`); return v; }

// Code, name (case insensitive), or UUID prefix. Ambiguity lists the candidates.
export async function resolve(db, kind, ref) {
  const l = LOOKUP[kind];
  if (!ref) throw Error(`Name a ${l.label.replace(/s$/, '')}`);
  const rows = await db.query(`select * from (${l.sql}) t where lower(code) = lower($1) or lower(name) = lower($1) or id::text like lower($1) || '%'
    or lower(name) like '%' || lower($1) || '%'`, [ref]);
  const exact = rows.filter((r) => r.code.toLowerCase() === ref.toLowerCase() || r.name.toLowerCase() === ref.toLowerCase());
  const hits = exact.length ? exact : rows;
  if (!hits.length) throw Error(`No ${l.label} match "${ref}"`);
  if (hits.length > 1) throw Error(`Ambiguous ${l.label} "${ref}": ${hits.map((r) => `${r.code} (${r.name})`).join(', ')}`);
  return hits[0];
}
async function colourway(db, styleId, ref) {
  if (!ref) return null;
  const rows = await db.query('select id, code from plm.colourways where style_id = $1 and (lower(code) = lower($2) or lower(name) = lower($2))', [styleId, ref]);
  if (!rows.length) throw Error(`No colourway "${ref}" on this style`);
  return rows[0].id;
}

async function tx(db, fn, { dryRun = false } = {}) {
  await db.exec('BEGIN');
  try { const out = await fn(); await db.exec(dryRun ? 'ROLLBACK' : 'COMMIT'); return out; }
  catch (e) { await db.exec('ROLLBACK'); throw e; }
}
async function markStep(db, styleId, step, by, on = null) {
  await db.query(`insert into plm.milestones (style_id, step_code, done_on, done_by) values ($1, $2, coalesce($3::date, current_date), $4)
    on conflict (style_id, step_code) do nothing`, [styleId, step, on, by]);
}

// ------------------------------------------------------------------ commands
export async function run(db, argv) {
  const [cmd, ...rest] = argv;
  const { pos, opts } = parseArgs(rest);
  if (!cmd || cmd === 'help') return HELP;
  if (READS[cmd]) { allow(opts, []); noExtra(pos, 0); return db.query(READS[cmd]); }
  if (OPTION_READS[cmd]) { allow(opts, OPTION_READS[cmd].opts); noExtra(pos, 0); return OPTION_READS[cmd].run(db, opts); }

  switch (cmd) {
    case 'attention': { allow(opts, []); noExtra(pos, 0); return attention(db); }
    case 'style': {
      allow(opts, []); noExtra(pos, 1);
      const s = await resolve(db, 'styles', pos[0]);
      return {
        style: (await db.query(`select s.code, s.name, se.code season, s.category, s.department, f.code factory, s.designer, s.status,
          ${money('s.retail_cents')} retail, s.target_margin_pct, s.planned_units, s.size_range, array_to_string(s.markets, ' ') markets,
          s.fibre_content, s.care_instructions, s.care_symbols, s.origin, s.childrens_nightwear, s.nightwear_category, s.fire_label
          from plm.styles s join plm.seasons se on se.id = s.season_id left join plm.factories f on f.id = s.factory_id where s.id = $1`, [s.id]))[0],
        colourways: await db.query('select code, name, status from plm.colourways where style_id = $1 order by code', [s.id]),
        bill_of_materials: await db.query(`select m.code, m.name, b.placement, b.consumption, m.unit, b.wastage_pct,
          ${money('round(m.unit_cost_cents * b.consumption * (1 + b.wastage_pct / 100))', 'm.currency')} line_cost
          from plm.bom_lines b join plm.materials m on m.id = b.material_id where b.style_id = $1 order by m.kind, m.code`, [s.id]),
        spec: await db.query('select pom_code pom, description, size, spec_cm, tolerance_cm from plm.spec_lines where style_id = $1 order by size, pom_code', [s.id]),
        cost: await db.query(`select version, costing_status, factory, ${money('fob_cents', 'fob_currency')} fob, fx_rate, ${money('landed_cents')} landed,
          margin_pct, target_margin_pct target, ${money('retail_ex_gst_needed_cents')} retail_ex_gst_for_target from plm.style_cost where style_id = $1`, [s.id]),
        critical_path: await db.query('select step_name step, due_on, done_on, days_late, state from plm.critical_path where style_id = $1 order by sort', [s.id]),
        samples: await db.query('select code, kind, size, due_on, received_on, status, days_overdue from plm.sample_status where id in (select id from plm.samples where style_id = $1) order by requested_on', [s.id]),
        approvals: await db.query('select code, kind, submitted_on, status, comments from plm.approvals where style_id = $1 order by submitted_on', [s.id]),
        orders: await db.query('select code, units, ex_factory_on, status from plm.production_orders where style_id = $1 order by ex_factory_on', [s.id]),
        rule_findings: await db.query('select rule, detail from plm.compliance_findings where style = $1', [s.code]),
        notes: await db.query("select created_at, author, body from plm.notes where subject_type = 'style' and subject_id = $1 order by created_at", [s.id]),
      };
    }
    case 'sample': {
      allow(opts, []); noExtra(pos, 1);
      const sa = await resolve(db, 'samples', pos[0]);
      return {
        sample: (await db.query('select code, style, name, colourway, factory, kind, size, requested_on, due_on, received_on, status, days_overdue from plm.sample_status where id = $1', [sa.id]))[0],
        measurements: await db.query(`select sp.pom_code pom, sp.description, sp.spec_cm, m.measured_cm, round(m.measured_cm - sp.spec_cm, 1) off_by_cm, sp.tolerance_cm,
          case when m.measured_cm is null then 'not measured' when abs(m.measured_cm - sp.spec_cm) > sp.tolerance_cm then 'OUT' else 'ok' end result
          from plm.samples sa join plm.spec_lines sp on sp.style_id = sa.style_id and sp.size = sa.size
          left join plm.fit_measurements m on m.sample_id = sa.id and m.pom_code = sp.pom_code where sa.id = $1 order by sp.pom_code`, [sa.id]),
        comments: (await db.query('select comments, decided_by, decided_on from plm.samples where id = $1', [sa.id]))[0],
        notes: await db.query("select created_at, author, body from plm.notes where subject_type = 'sample' and subject_id = $1 order by created_at", [sa.id]),
      };
    }
    case 'factory': {
      allow(opts, []); noExtra(pos, 1);
      const f = await resolve(db, 'factories', pos[0]);
      return {
        factory: (await db.query('select code, name, country, contact, email, speciality, audit_scheme, audit_expires_on, sample_lead_days from plm.factories where id = $1', [f.id]))[0],
        scorecard: (await db.query('select samples, received, on_time_pct, avg_days_late, overdue_now, rejected_pct, open_order_units from plm.factory_scorecard where id = $1', [f.id]))[0],
        open_samples: await db.query(`select code, style, kind, due_on, days_overdue from plm.sample_status where factory = $1 and status = 'requested' order by due_on`, [f.code]),
        orders: await db.query(`select o.code, s.code style, o.units, o.ex_factory_on, o.status from plm.production_orders o join plm.styles s on s.id = o.style_id
          where o.factory_id = $1 and o.status not in ('received','cancelled') order by o.ex_factory_on`, [f.id]),
        notes: await db.query("select created_at, author, body from plm.notes where subject_type = 'factory' and subject_id = $1 order by created_at", [f.id]),
      };
    }
    case 'material': {
      allow(opts, []); noExtra(pos, 1);
      const m = await resolve(db, 'materials', pos[0]);
      return {
        material: (await db.query(`select code, name, kind, composition, supplier, unit, ${money('unit_cost_cents', 'currency')} unit_cost, moq from plm.materials where id = $1`, [m.id]))[0],
        where_used: await db.query(`select s.code style, s.name, se.code season, b.placement, b.consumption, b.wastage_pct, u.units,
          round(b.consumption * (1 + b.wastage_pct / 100) * u.units, 1) required
          from plm.bom_lines b join plm.styles s on s.id = b.style_id join plm.seasons se on se.id = s.season_id join plm.style_units u on u.style_id = s.id
          where b.material_id = $1 and s.status <> 'dropped' order by se.launch_on, s.code`, [m.id]),
        demand: await db.query('select season, styles, required, moq, flag from plm.material_demand where material_id = $1 order by season', [m.id]),
      };
    }
    case 'add': return add(db, pos, opts);
    case 'log': {
      allow(opts, ['author', 'text']); noExtra(pos, 2);
      const kinds = { style: 'styles', sample: 'samples', factory: 'factories', approval: 'approvals', order: 'orders', season: 'seasons' };
      if (!kinds[pos[0]]) throw Error('log needs style, sample, factory, approval, order or season first');
      const target = await resolve(db, kinds[pos[0]], pos[1]);
      const [row] = await db.query('insert into plm.notes (subject_type, subject_id, author, body) values ($1, $2, $3, $4) returning created_at, author, body',
        [pos[0], target.id, need(opts, 'author'), need(opts, 'text')]);
      return { logged: target.code, ...row };
    }
    case 'request-sample': return requestSample(db, pos, opts);
    case 'receive-sample': {
      allow(opts, ['on']); noExtra(pos, 1);
      const sa = await resolve(db, 'samples', pos[0]);
      const on = opts.on ? date(opts.on) : null;
      const [row] = await db.query(`update plm.samples set status = 'received', received_on = coalesce($2::date, current_date)
        where id = $1 and status = 'requested' returning code, received_on, received_on - due_on days_late`, [sa.id, on]);
      if (!row) throw Error(`${sa.code} is not waiting to be received`);
      return { ...row, days_late: Math.max(0, Number(row.days_late)) };
    }
    case 'measure': {
      allow(opts, ['points']); noExtra(pos, 1);
      const sa = await resolve(db, 'samples', pos[0]);
      const points = need(opts, 'points').split(',').map((p) => {
        const m = p.trim().match(/^([A-Za-z0-9.-]+):(\d+(?:\.\d+)?)$/);
        if (!m) throw Error(`Cannot read point "${p}". Use POM:cm, for example A:54.5`);
        return { pom: m[1], cm: Number(m[2]) };
      });
      return tx(db, async () => {
        const [s] = await db.query('select style_id, size, status from plm.samples where id = $1', [sa.id]);
        if (s.status === 'requested') throw Error(`${sa.code} has not been received yet`);
        for (const p of points) {
          const spec = await db.query('select 1 from plm.spec_lines where style_id = $1 and pom_code = $2 and size = $3', [s.style_id, p.pom, s.size]);
          if (!spec.length) throw Error(`No spec for point ${p.pom} in size ${s.size}. Add it to the tech pack first.`);
          await db.query(`insert into plm.fit_measurements (sample_id, pom_code, measured_cm) values ($1, $2, $3)
            on conflict (sample_id, pom_code) do update set measured_cm = excluded.measured_cm`, [sa.id, p.pom, p.cm]);
        }
        return { sample: sa.code, measured: points.length, out_of_tolerance: await db.query('select pom_code pom, description, spec_cm, measured_cm, off_by_cm, tolerance_cm from plm.fit_issues where sample_id = $1 order by pom_code', [sa.id]) };
      });
    }
    case 'decide-sample': {
      allow(opts, ['status', 'by', 'comments']); noExtra(pos, 1);
      const status = oneOf(need(opts, 'status'), ['approved', 'rejected'], '--status');
      const sa = await resolve(db, 'samples', pos[0]);
      const by = need(opts, 'by');
      return tx(db, async () => {
        const [row] = await db.query(`update plm.samples set status = $2, decided_on = current_date, decided_by = $3, comments = coalesce($4, comments)
          where id = $1 and status = 'received' returning code, style_id, kind, status`, [sa.id, status, by, opts.comments || null]);
        if (!row) throw Error(`${sa.code} must be received, and not yet decided, before it can be ${status}`);
        const step = status === 'approved' ? SAMPLE_STEP[row.kind] : null;
        if (step) await markStep(db, row.style_id, step, by);
        return { sample: row.code, kind: row.kind, status: row.status, critical_path_step_done: step || '' };
      });
    }
    case 'decide-approval': {
      allow(opts, ['status', 'by', 'comments']); noExtra(pos, 1);
      const status = oneOf(need(opts, 'status'), ['approved', 'rejected', 'resubmit'], '--status');
      const a = await resolve(db, 'approvals', pos[0]);
      return tx(db, async () => {
        const [row] = await db.query(`update plm.approvals set status = $2, decided_on = current_date, decided_by = $3, comments = coalesce($4, comments)
          where id = $1 and status in ('pending','resubmit') returning code, style_id, kind, status`, [a.id, status, need(opts, 'by'), opts.comments || null]);
        if (!row) throw Error(`${a.code} has already been decided`);
        // The colour step is done when nothing is left waiting on the style.
        let colourDone = false;
        if (status === 'approved' && !(await db.query("select 1 from plm.approvals where style_id = $1 and status <> 'approved' and status <> 'rejected'", [row.style_id])).length) {
          await markStep(db, row.style_id, 'colour', need(opts, 'by')); colourDone = true;
        }
        return { approval: row.code, kind: row.kind, status: row.status, colour_step_done: colourDone };
      });
    }
    case 'complete-step': {
      allow(opts, ['step', 'by', 'on']); noExtra(pos, 1);
      const s = await resolve(db, 'styles', pos[0]);
      const step = need(opts, 'step');
      if (!(await db.query('select 1 from plm.path_steps where code = $1', [step])).length)
        throw Error(`Unknown step "${step}". Steps: ${(await db.query('select code from plm.path_steps order by sort')).map((r) => r.code).join(', ')}`);
      const [row] = await db.query(`insert into plm.milestones (style_id, step_code, done_on, done_by) values ($1, $2, coalesce($3::date, current_date), $4)
        on conflict (style_id, step_code) do nothing returning done_on`, [s.id, step, opts.on ? date(opts.on) : null, need(opts, 'by')]);
      if (!row) throw Error(`${s.code} already has ${step} done`);
      return { style: s.code, step, done_on: row.done_on };
    }
    case 'cost': return cost(db, pos, opts);
    case 'agree-costing': {
      allow(opts, ['by']); noExtra(pos, 1);
      const s = await resolve(db, 'styles', pos[0]);
      return tx(db, async () => {
        const [row] = await db.query(`update plm.costings set status = 'agreed' where id = (select id from plm.costings where style_id = $1 and status <> 'superseded'
          order by version desc limit 1) and status = 'quoted' returning version`, [s.id]);
        if (!row) throw Error(`${s.code} has no quoted costing waiting to be agreed`);
        await markStep(db, s.id, 'costing', need(opts, 'by'));
        return { style: s.code, agreed_version: row.version, ...(await db.query('select margin_pct, target_margin_pct target from plm.style_cost where style_id = $1', [s.id]))[0] };
      });
    }
    case 'set-status': {
      allow(opts, ['status']); noExtra(pos, 1);
      const s = await resolve(db, 'styles', pos[0]);
      const [row] = await db.query('update plm.styles set status = $2 where id = $1 returning code, status', [s.id, need(opts, 'status')]);
      return row;
    }
    case 'import': return importCsv(db, pos, opts);
    case 'export': {
      allow(opts, ['out']); noExtra(pos, 0);
      const out = path.resolve(need(opts, 'out'));
      const data = {};
      for (const t of TABLES) data[t] = await db.query(`select * from plm.${t}`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify({ exported_at: new Date().toISOString(), tables: data }, null, 2), { mode: 0o600 });
      return { file: out, counts: Object.fromEntries(TABLES.map((t) => [t, data[t].length])) };
    }
    case 'draft-weekly': { allow(opts, []); noExtra(pos, 0); return draftWeekly(db); }
    case 'draft-sample-comments': { allow(opts, []); noExtra(pos, 1); return draftSampleComments(db, pos[0]); }
    default: throw Error(`Unknown command "${cmd}". Run: npm run plm -- help`);
  }
}

async function attention(db) {
  const items = [];
  for (const r of await db.query(READS.samples)) {
    if (r.flag === 'OVERDUE') items.push({ area: 'samples', item: `${r.code} ${r.style}`, detail: `${r.kind} sample from ${r.factory} ${r.days_overdue} days overdue (due ${r.due_on})` });
    if (r.flag === 'DECIDE') items.push({ area: 'samples', item: `${r.code} ${r.style}`, detail: `${r.kind} sample received ${r.received_on}, waiting for a decision` });
  }
  for (const r of await db.query(READS['fit-issues'])) if (r.sample_status === 'received')
    items.push({ area: 'fit', item: `${r.sample} ${r.style}`, detail: `${r.description} ${r.off_by_cm > 0 ? '+' : ''}${r.off_by_cm} cm against spec (tolerance ${r.tolerance_cm})` });
  for (const r of await db.query("select style, name, step_name, days_late from plm.critical_path where state = 'late' order by days_late desc"))
    items.push({ area: 'critical path', item: `${r.style} ${r.name}`, detail: `${r.step_name} ${r.days_late} days late` });
  for (const r of await db.query(READS.approvals)) if (r.days_overdue > 0 || r.status === 'resubmit')
    items.push({ area: 'colour', item: `${r.code} ${r.style}`, detail: `${r.kind} ${r.status}${r.days_overdue > 0 ? `, ${r.days_overdue} day${r.days_overdue === 1 ? '' : 's'} past due` : ''}` });
  for (const r of await db.query(READS.margins)) if (r.flag === 'UNDER TARGET')
    items.push({ area: 'margin', item: `${r.code} ${r.name}`, detail: `${r.margin_pct}% against a ${r.target}% target at landed ${r.landed}` });
  for (const r of await db.query(READS.compliance)) items.push({ area: 'rules', item: `${r.rule} ${r.style}`, detail: r.detail });
  for (const r of await db.query("select code, name, audit_expires_on from plm.factories where active and audit_expires_on < current_date + (select audit_warning_days from plm.settings)"))
    items.push({ area: 'factory', item: `${r.code} ${r.name}`, detail: `social audit expires ${r.audit_expires_on}` });
  for (const r of await db.query("select code, name, season, required, moq from plm.material_demand where flag <> ''"))
    items.push({ area: 'materials', item: `${r.code} ${r.name}`, detail: `${r.season} needs ${r.required} against a minimum order of ${r.moq}` });
  return items;
}

async function add(db, pos, opts) {
  allow(opts, ['data']); noExtra(pos, 1);
  const type = pos[0];
  if (!ADD_FIELDS[type]) throw Error(`add needs one of: ${Object.keys(ADD_FIELDS).join(', ')}`);
  const data = JSON.parse(fs.readFileSync(need(opts, 'data'), 'utf8'));
  const unknown = Object.keys(data).filter((k) => !ADD_FIELDS[type].includes(k));
  if (unknown.length) throw Error(`Unknown field(s) for ${type}: ${unknown.join(', ')}`);
  for (const [k, kind] of Object.entries(REFS)) if (data[k]) data[k] = (await resolve(db, kind, String(data[k]))).id;
  if (data.colourway_id) data.colourway_id = await colourway(db, data.style_id, String(data.colourway_id));
  const cols = Object.keys(data);
  if (!cols.length) throw Error('No fields supplied');
  const [row] = await db.query(`insert into plm.${type} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`, cols.map((c) => data[c]));
  return row;
}

async function requestSample(db, pos, opts) {
  allow(opts, ['kind', 'size', 'colourway', 'factory', 'due']); noExtra(pos, 1);
  const s = await resolve(db, 'styles', pos[0]);
  const kind = oneOf(need(opts, 'kind'), ['proto', 'fit', 'sales', 'pp', 'top'], '--kind');
  const [st] = await db.query('select factory_id from plm.styles where id = $1', [s.id]);
  const factoryId = opts.factory ? (await resolve(db, 'factories', String(opts.factory))).id : st.factory_id;
  if (!factoryId) throw Error(`${s.code} has no factory. Pass --factory=`);
  const cw = await colourway(db, s.id, opts.colourway ? String(opts.colourway) : null);
  return tx(db, async () => {
    const [{ n }] = await db.query("select count(*)::int + 1 n from plm.samples where code like $1 || '-S%'", [s.code]);
    const code = `${s.code}-S${String(n).padStart(2, '0')}`;
    const [row] = await db.query(`insert into plm.samples (code, style_id, colourway_id, factory_id, kind, size, requested_on, due_on)
      values ($1, $2, $3, $4, $5, $6, current_date, coalesce($7::date, current_date + (select sample_lead_days from plm.factories where id = $4)))
      returning code, kind, size, requested_on, due_on`, [code, s.id, cw, factoryId, kind, opts.size ? String(opts.size) : null, opts.due ? date(opts.due) : null]);
    return row;
  });
}

async function cost(db, pos, opts) {
  allow(opts, ['fob', 'fx', 'freight', 'duty', 'currency', 'factory', 'note']); noExtra(pos, 1);
  const s = await resolve(db, 'styles', pos[0]);
  const fob = cents(need(opts, 'fob'), '--fob');
  const fx = Number(need(opts, 'fx'));
  if (!Number.isFinite(fx) || fx <= 0) throw Error('--fx must be a positive rate');
  const freight = opts.freight ? cents(opts.freight, '--freight') : 0;
  const duty = opts.duty ? Number(opts.duty) : 0;
  if (!Number.isFinite(duty) || duty < 0 || duty >= 100) throw Error('--duty is a percentage from 0 to 99');
  const currency = String(opts.currency || 'USD').toUpperCase();
  const [st] = await db.query('select factory_id from plm.styles where id = $1', [s.id]);
  const factoryId = opts.factory ? (await resolve(db, 'factories', String(opts.factory))).id : st.factory_id;
  if (!factoryId) throw Error(`${s.code} has no factory. Pass --factory=`);
  return tx(db, async () => {
    const [{ v }] = await db.query('select coalesce(max(version), 0) + 1 v from plm.costings where style_id = $1', [s.id]);
    await db.query("update plm.costings set status = 'superseded' where style_id = $1 and status <> 'superseded'", [s.id]);
    await db.query(`insert into plm.costings (style_id, version, factory_id, fob_cents, fob_currency, fx_rate, freight_cents, duty_pct, note)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [s.id, v, factoryId, fob, currency, fx, freight, duty, opts.note || null]);
    const [c] = await db.query(`select version, ${money('landed_cents')} landed, margin_pct, target_margin_pct target, margin_gap_pct gap,
      ${money('retail_ex_gst_needed_cents')} retail_ex_gst_for_target from plm.style_cost where style_id = $1`, [s.id]);
    return { style: s.code, ...c };
  });
}

// ------------------------------------------------------------------ imports
// Delogue's style list and item reports save to Excel; save that sheet as CSV. Column names vary by
// account set-up, so each field accepts the common names. Check yours against docs/replace-delogue.md.
const STYLE_COLUMNS = {
  code: ['Style No', 'Style No.', 'Style Number', 'Style', 'Style Code'], name: ['Style Name', 'Name', 'Description'],
  season: ['Season'], category: ['Category', 'Product Type', 'Product Group', 'Style Type'], department: ['Gender', 'Department', 'Target Group'],
  supplier: ['Supplier', 'Vendor', 'Factory'], designer: ['Designer', 'Responsible', 'Owner'], retail: ['Retail Price', 'RRP', 'Sales Price', 'Recommended Retail Price'],
  fob: ['Purchase Price', 'FOB', 'FOB Price', 'Cost Price'], currency: ['Purchase Currency', 'Currency'], composition: ['Composition', 'Fibre Content', 'Fiber Content', 'Main Composition'],
  care: ['Care Instructions', 'Care', 'Care Text'], origin: ['Country of Origin', 'Origin', 'COO'], colours: ['Colours', 'Colors', 'Colourways', 'Colorways'],
  sizes: ['Size Range', 'Sizes'],
};
const DEPARTMENTS = { women: 'womens', womens: 'womens', ladies: 'womens', men: 'mens', mens: 'mens', unisex: 'unisex', kids: 'kids', children: 'kids', boys: 'kids', girls: 'kids' };
export function mapStyleRow(r, n) {
  const get = (k) => pick(r, ...STYLE_COLUMNS[k]);
  const code = get('code'); const name = get('name'); const season = get('season');
  if (!code || !name) throw Error(`Row ${n}: style number and name are required`);
  if (!season) throw Error(`Row ${n}: no season column`);
  const dept = DEPARTMENTS[get('department').toLowerCase().replace(/[^a-z]/g, '')] || 'unisex';
  return {
    code, name, season, category: (get('category') || 'uncategorised').toLowerCase(), department: dept, supplier: get('supplier'),
    designer: get('designer') || null, retail_cents: get('retail') ? cents(get('retail'), `Row ${n} retail price`) : null,
    fob_cents: get('fob') ? cents(get('fob'), `Row ${n} purchase price`) : null, currency: (get('currency') || 'USD').toUpperCase().slice(0, 3),
    fibre_content: get('composition') || null, care_instructions: get('care') || null, origin: get('origin') || null, size_range: get('sizes') || null,
    colours: get('colours') ? get('colours').split(/[;|\/]/).map((c) => c.trim()).filter(Boolean) : [],
  };
}
const ITEM_COLUMNS = {
  code: ['Item No', 'Item No.', 'Item Number', 'Item', 'Item Code'], name: ['Item Name', 'Name', 'Description'], type: ['Item Type', 'Type', 'Category', 'Item Category'],
  composition: ['Composition', 'Fibre Content', 'Fiber Content'], supplier: ['Supplier', 'Vendor'], unit: ['Unit', 'UOM', 'Unit of Measure'],
  price: ['Price', 'Purchase Price', 'Cost', 'Unit Price'], currency: ['Currency', 'Purchase Currency'], moq: ['MOQ', 'Minimum Order', 'Minimum Order Quantity'],
};
function mapItemRow(r, n) {
  const get = (k) => pick(r, ...ITEM_COLUMNS[k]);
  const code = get('code'); const name = get('name');
  if (!code || !name) throw Error(`Row ${n}: item number and name are required`);
  const t = get('type').toLowerCase();
  const kind = t.includes('fabric') ? 'fabric' : t.includes('label') ? 'label' : t.includes('pack') ? 'packaging' : 'trim';
  const unitRaw = get('unit').toLowerCase();
  const unit = { m: 'm', meter: 'm', metre: 'm', meters: 'm', metres: 'm', yd: 'yd', yard: 'yd', yards: 'yd', pc: 'pc', pcs: 'pc', piece: 'pc', pieces: 'pc', set: 'set', kg: 'kg', cone: 'cone' }[unitRaw] || (unitRaw ? null : (kind === 'fabric' ? 'm' : 'pc'));
  if (!unit) throw Error(`Row ${n}: unit "${get('unit')}" must be m, yd, pc, set, kg or cone`);
  const moq = get('moq') === '' ? null : Number(get('moq').replace(/,/g, ''));
  if (moq !== null && !Number.isFinite(moq)) throw Error(`Row ${n}: MOQ "${get('moq')}" is not a number`);
  return { code, name, kind, composition: get('composition') || null, supplier: get('supplier') || null, unit,
    unit_cost_cents: get('price') ? cents(get('price'), `Row ${n} price`) : null, currency: (get('currency') || 'USD').toUpperCase().slice(0, 3), moq };
}

async function importCsv(db, pos, opts) {
  allow(opts, ['file', 'dry-run', 'fx']); noExtra(pos, 1);
  const kind = pos[0];
  if (!['delogue', 'items'].includes(kind)) throw Error('import needs delogue (styles) or items (materials)');
  const file = need(opts, 'file');
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  if (!rows.length) throw Error('The file has no rows');
  const mapped = rows.map((r, i) => (kind === 'delogue' ? mapStyleRow(r, i + 2) : mapItemRow(r, i + 2)));
  const fx = opts.fx === undefined ? null : Number(opts.fx);
  if (fx !== null && (!Number.isFinite(fx) || fx <= 0)) throw Error('--fx must be a positive rate');
  if (kind === 'delogue' && fx === null && mapped.some((m) => m.fob_cents)) throw Error('The file has purchase prices. Pass --fx=<brand currency per one unit of the purchase currency> to cost them, for example --fx=1.70');
  const dryRun = opts['dry-run'] === true;
  const source = kind === 'delogue' ? 'delogue-styles' : 'delogue-items';
  return tx(db, async () => {
    const result = { file: path.basename(file), rows: rows.length, inserted: 0, skipped_identical: 0, colourways: 0, costings: 0, dry_run: dryRun };
    for (let i = 0; i < mapped.length; i++) {
      const m = mapped[i];
      const hash = crypto.createHash('sha256').update(JSON.stringify({ m, fx })).digest('hex');
      if ((await db.query('select 1 from plm.import_rows where source = $1 and row_hash = $2', [source, hash])).length) { result.skipped_identical++; continue; }
      let id;
      if (kind === 'items') {
        if ((await db.query('select 1 from plm.materials where lower(code) = lower($1)', [m.code])).length) throw Error(`Row ${i + 2}: item ${m.code} already exists. Nothing was imported.`);
        [{ id }] = await db.query(`insert into plm.materials (code, name, kind, composition, supplier, unit, unit_cost_cents, currency, moq)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`, [m.code, m.name, m.kind, m.composition, m.supplier, m.unit, m.unit_cost_cents, m.currency, m.moq]);
      } else {
        if ((await db.query('select 1 from plm.styles where lower(code) = lower($1)', [m.code])).length) throw Error(`Row ${i + 2}: style ${m.code} already exists. Nothing was imported.`);
        const se = await resolve(db, 'seasons', m.season).catch((e) => { throw Error(`Row ${i + 2}: ${e.message}. Add the season first.`); });
        const f = m.supplier ? await resolve(db, 'factories', m.supplier).catch((e) => { throw Error(`Row ${i + 2}: ${e.message}. Add the factory first.`); }) : null;
        [{ id }] = await db.query(`insert into plm.styles (code, name, season_id, category, department, factory_id, designer, retail_cents, size_range, fibre_content, care_instructions, origin)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
          [m.code, m.name, se.id, m.category, m.department, f ? f.id : null, m.designer, m.retail_cents, m.size_range, m.fibre_content, m.care_instructions, m.origin]);
        for (const [j, c] of m.colours.entries()) {
          await db.query('insert into plm.colourways (style_id, code, name) values ($1, $2, $3) on conflict do nothing', [id, String(j + 1).padStart(2, '0'), c]);
          result.colourways++;
        }
        if (m.fob_cents) {
          if (!f) throw Error(`Row ${i + 2}: a purchase price needs a supplier to cost against`);
          await db.query(`insert into plm.costings (style_id, version, factory_id, fob_cents, fob_currency, fx_rate, note) values ($1, 1, $2, $3, $4, $5, 'Imported from Delogue')`,
            [id, f.id, m.fob_cents, m.currency, fx]);
          result.costings++;
        }
      }
      result.inserted++;
      await db.query('insert into plm.import_rows (source, file_name, row_number, row_hash, target_id) values ($1, $2, $3, $4, $5)', [source, path.basename(file), i + 2, hash, id]);
    }
    return result;
  }, { dryRun });
}

// ------------------------------------------------------------------ drafts (never sent)
function draftsDir() { const d = path.resolve(process.env.OUTPUT_DIR || REPO_ROOT, 'drafts'); fs.mkdirSync(d, { recursive: true }); return d; }
function md(rows) {
  if (!rows.length) return '_None._\n';
  const keys = Object.keys(rows[0]);
  return [`| ${keys.join(' | ')} |`, `| ${keys.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${keys.map((k) => String(r[k] ?? '').replace(/\|/g, '/')).join(' | ')} |`)].join('\n') + '\n';
}
async function draftWeekly(db) {
  const [{ today }] = await db.query('select current_date::text today');
  const body = [`# Product development review, week of ${today}`, '',
    'Draft for the product team. Figures come from the product database at the time of writing. Nothing has been sent.', '',
    '## What needs attention', md(await attention(db)),
    '## Critical path, most behind first', md((await db.query(READS['critical-path'])).slice(0, 12)),
    '## Samples', md(await db.query(READS.samples)),
    '## Margins', md(await db.query(READS.margins)),
    '## Rule checks', md(await db.query(READS.compliance)),
    '## Factories', md(await db.query(READS.factories))].join('\n');
  const file = path.join(draftsDir(), `weekly-review-${today}.md`);
  fs.writeFileSync(file, body);
  return { draft: file, sections: 6 };
}
async function draftSampleComments(db, ref) {
  const sa = await resolve(db, 'samples', ref);
  const [s] = await db.query(`select sa.code, sa.kind, sa.size, sa.status, sa.comments, st.code style, st.name, f.contact, f.name factory, c.name colourway
    from plm.samples sa join plm.styles st on st.id = sa.style_id join plm.factories f on f.id = sa.factory_id left join plm.colourways c on c.id = sa.colourway_id
    where sa.id = $1`, [sa.id]);
  if (s.status === 'requested') throw Error(`${s.code} has not been received yet: there is nothing to comment on`);
  const issues = await db.query('select pom_code pom, description, spec_cm, measured_cm, off_by_cm, tolerance_cm from plm.fit_issues where sample_id = $1 order by pom_code', [sa.id]);
  const [{ today }] = await db.query('select current_date::text today');
  const body = [`Hi ${String(s.contact || s.factory).split(' ')[0]},`, '',
    `Comments on ${s.kind} sample ${s.code}, style ${s.style} ${s.name}${s.colourway ? `, ${s.colourway}` : ''}, size ${s.size || 'n/a'}.`, '',
    `Decision: ${s.status === 'received' ? 'not decided yet' : s.status}.`, '',
    issues.length ? 'Measurements outside tolerance:' : 'All measured points are within tolerance.', '', issues.length ? md(issues) : '',
    s.comments ? `Notes: ${s.comments}` : '', '',
    'Please confirm the corrections and the date of the next sample.', ''].join('\n');
  const file = path.join(draftsDir(), `sample-comments-${s.code}-${today}.md`);
  fs.writeFileSync(file, body);
  return { draft: file, points_out: issues.length };
}

// ------------------------------------------------------------------ main
function print(out) {
  if (Array.isArray(out)) {
    if (!out.length) return console.log('  (none)');
    const keys = Object.keys(out[0]);
    return console.log(table(out, keys.map((k) => ({ key: k, label: k.replace(/_/g, ' '), width: 70,
      align: typeof out[0][k] === 'number' || /^-?\d+(\.\d+)?$/.test(String(out[0][k] ?? '')) ? 'right' : 'left' }))));
  }
  if (out && typeof out === 'object') {
    for (const [k, v] of Object.entries(out)) {
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') { console.log(`\n${k.replace(/_/g, ' ')}`); print(v); }
      else if (Array.isArray(v) && !v.length) console.log(`\n${k.replace(/_/g, ' ')}\n  (none)`);
      else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) { console.log(`\n${k.replace(/_/g, ' ')}`); for (const [k2, v2] of Object.entries(v)) console.log(`  ${k2.replace(/_/g, ' ')}: ${v2 ?? ''}`); }
      else console.log(`${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : v ?? ''}`);
    }
  }
}
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const db = await getDb();
  try {
    const out = await run(db, args.filter((a) => a !== '--json'));
    if (json) console.log(JSON.stringify(out, null, 2)); else print(out);
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally { await db.close(); }
}
