-- The views the weekly commands read. Every number is worked out here, in plain SQL,
-- so a person can read how a margin, a late step or a rule finding was reached.

-- Units a style is planned at: placed production orders win over the plan figure.
create or replace view plm.style_units as
select s.id style_id,
  coalesce(nullif((select sum(o.units) from plm.production_orders o where o.style_id = s.id and o.status <> 'cancelled'), 0), s.planned_units)::int units,
  exists (select 1 from plm.production_orders o where o.style_id = s.id and o.status <> 'cancelled') from_orders
from plm.styles s;

-- The current costing per style (highest version that is not superseded) and the margin it gives.
create or replace view plm.style_cost as
with latest as (
  select distinct on (c.style_id) c.* from plm.costings c where c.status <> 'superseded' order by c.style_id, c.version desc
), calc as (
  select s.id style_id, s.code, s.name, se.code season, s.category, s.status style_status, s.retail_cents, s.target_margin_pct,
    l.version, l.status costing_status, l.fob_cents, l.fob_currency, l.fx_rate, l.freight_cents, l.duty_pct, f.code factory,
    round(s.retail_cents / (1 + st.gst_pct / 100))::int retail_ex_gst_cents,
    case when l.id is null then null else
      (round(l.fob_cents * l.fx_rate) + l.freight_cents + round(l.fob_cents * l.fx_rate * l.duty_pct / 100))::int end landed_cents,
    st.brand_currency currency
  from plm.styles s join plm.seasons se on se.id = s.season_id cross join plm.settings st
  left join latest l on l.style_id = s.id left join plm.factories f on f.id = l.factory_id
  where s.status <> 'dropped'
)
select calc.*,
  case when landed_cents is null or retail_ex_gst_cents is null then null
    else round(100.0 * (retail_ex_gst_cents - landed_cents) / retail_ex_gst_cents, 1) end margin_pct,
  case when landed_cents is null or retail_ex_gst_cents is null then null
    else round(100.0 * (retail_ex_gst_cents - landed_cents) / retail_ex_gst_cents - target_margin_pct, 1) end margin_gap_pct,
  case when landed_cents is null or retail_ex_gst_cents is null then null
    else round(landed_cents / (1 - target_margin_pct / 100.0))::int end retail_ex_gst_needed_cents
from calc;

-- Every step on every live style, with when it is due and whether it is late.
create or replace view plm.critical_path as
select s.id style_id, s.code style, s.name, se.code season, f.code factory, p.code step, p.name step_name, p.sort,
  (se.launch_on - p.days_before_launch) due_on, m.done_on,
  case when m.done_on is null and se.launch_on - p.days_before_launch < current_date then current_date - (se.launch_on - p.days_before_launch)
       when m.done_on is not null and m.done_on > se.launch_on - p.days_before_launch then m.done_on - (se.launch_on - p.days_before_launch)
       else 0 end days_late,
  case when m.done_on is not null then 'done'
       when se.launch_on - p.days_before_launch < current_date then 'late'
       when se.launch_on - p.days_before_launch <= current_date + 14 then 'due soon'
       else 'open' end state
from plm.styles s join plm.seasons se on se.id = s.season_id cross join plm.path_steps p
left join plm.milestones m on m.style_id = s.id and m.step_code = p.code
left join plm.factories f on f.id = s.factory_id
where s.status <> 'dropped' and se.status not in ('launched','closed');

-- How far each style is behind: its most overdue open step.
create or replace view plm.style_progress as
select style_id, style, name, season, factory,
  count(*) filter (where state = 'done')::int steps_done, count(*)::int steps,
  max(days_late) filter (where state = 'late')::int worst_days_late,
  (array_agg(step_name order by sort) filter (where state = 'late'))[1] first_late_step,
  (array_agg(step_name order by sort) filter (where state <> 'done'))[1] next_step,
  min(due_on) filter (where state <> 'done') next_due
from plm.critical_path group by style_id, style, name, season, factory;

create or replace view plm.sample_status as
select sa.id, sa.code, s.code style, s.name, c.code colourway, f.code factory, sa.kind, sa.size, sa.requested_on, sa.due_on, sa.received_on, sa.status,
  case when sa.status = 'requested' and sa.due_on < current_date then current_date - sa.due_on else 0 end days_overdue,
  case when sa.received_on is not null then greatest(sa.received_on - sa.due_on, 0) end days_late_on_arrival,
  (select count(*) from plm.fit_measurements m where m.sample_id = sa.id)::int measured_points
from plm.samples sa join plm.styles s on s.id = sa.style_id join plm.factories f on f.id = sa.factory_id
left join plm.colourways c on c.id = sa.colourway_id;

-- Measured points outside the tech pack tolerance for the sample's size.
create or replace view plm.fit_issues as
select sa.id sample_id, sa.code sample, s.code style, s.name, sa.kind, sa.size, sp.pom_code, sp.description,
  sp.spec_cm, m.measured_cm, round(m.measured_cm - sp.spec_cm, 1) off_by_cm, sp.tolerance_cm, sa.status sample_status
from plm.fit_measurements m join plm.samples sa on sa.id = m.sample_id join plm.styles s on s.id = sa.style_id
join plm.spec_lines sp on sp.style_id = sa.style_id and sp.pom_code = m.pom_code and sp.size = sa.size
where abs(m.measured_cm - sp.spec_cm) > sp.tolerance_cm;

create or replace view plm.approvals_waiting as
select a.id, a.code, s.code style, s.name, c.code colourway, a.kind, a.submitted_on, a.due_on, a.status,
  current_date - a.submitted_on days_waiting, case when a.due_on < current_date then current_date - a.due_on else 0 end days_overdue, a.comments
from plm.approvals a join plm.styles s on s.id = a.style_id left join plm.colourways c on c.id = a.colourway_id
where a.status in ('pending','resubmit') and s.status <> 'dropped';

-- Sample delivery over the last year, plus what is overdue now and the audit date.
create or replace view plm.factory_scorecard as
select f.id, f.code, f.name, f.country,
  count(sa.id) filter (where sa.requested_on >= current_date - 365 and sa.status <> 'cancelled')::int samples,
  count(sa.id) filter (where sa.received_on is not null and sa.requested_on >= current_date - 365)::int received,
  round(100.0 * count(sa.id) filter (where sa.received_on is not null and sa.received_on <= sa.due_on and sa.requested_on >= current_date - 365)
    / nullif(count(sa.id) filter (where sa.received_on is not null and sa.requested_on >= current_date - 365), 0), 0) on_time_pct,
  round(avg(greatest(sa.received_on - sa.due_on, 0)) filter (where sa.received_on is not null and sa.requested_on >= current_date - 365), 1) avg_days_late,
  count(sa.id) filter (where sa.status = 'requested' and sa.due_on < current_date)::int overdue_now,
  round(100.0 * count(sa.id) filter (where sa.status = 'rejected' and sa.requested_on >= current_date - 365)
    / nullif(count(sa.id) filter (where sa.status in ('approved','rejected') and sa.requested_on >= current_date - 365), 0), 0) rejected_pct,
  f.audit_scheme, f.audit_expires_on,
  (select coalesce(sum(o.units), 0) from plm.production_orders o where o.factory_id = f.id and o.status in ('placed','in_production'))::int open_order_units
from plm.factories f left join plm.samples sa on sa.factory_id = f.id
where f.active
group by f.id;

create or replace view plm.line_plan as
select se.code season, s.category, count(distinct s.id)::int styles,
  count(c.id) filter (where c.status = 'active')::int colourways,
  (select coalesce(sum(u.units), 0) from plm.style_units u join plm.styles s2 on s2.id = u.style_id
     where s2.season_id = se.id and s2.category = s.category and s2.status <> 'dropped')::int units,
  (select round(avg(sc.margin_pct), 1) from plm.style_cost sc join plm.styles s2 on s2.id = sc.style_id
     where s2.season_id = se.id and s2.category = s.category) avg_margin_pct,
  (select count(*) from plm.style_cost sc join plm.styles s2 on s2.id = sc.style_id
     where s2.season_id = se.id and s2.category = s.category and sc.margin_gap_pct < 0)::int under_target,
  (select count(*) from plm.style_cost sc join plm.styles s2 on s2.id = sc.style_id
     where s2.season_id = se.id and s2.category = s.category and sc.landed_cents is null)::int not_costed
from plm.styles s join plm.seasons se on se.id = s.season_id left join plm.colourways c on c.style_id = s.id
where s.status <> 'dropped'
group by se.id, se.code, s.category;

-- What the season needs of each material, against the supplier's minimum order.
create or replace view plm.material_demand as
select m.id material_id, m.code, m.name, m.kind, m.unit, m.supplier, se.code season,
  count(distinct s.id)::int styles,
  round(sum(b.consumption * (1 + b.wastage_pct / 100) * u.units), 1) required,
  m.moq, case when m.moq is not null and sum(b.consumption * (1 + b.wastage_pct / 100) * u.units) < m.moq then 'below MOQ' else '' end flag
from plm.bom_lines b join plm.materials m on m.id = b.material_id join plm.styles s on s.id = b.style_id
join plm.seasons se on se.id = s.season_id join plm.style_units u on u.style_id = s.id
where s.status <> 'dropped'
group by m.id, se.code;

-- Rule checks. Each rule is cited in docs/compliance.md. A finding is a prompt to check, not legal advice.
create or replace view plm.compliance_findings as
with live as (select s.*, se.code season from plm.styles s join plm.seasons se on se.id = s.season_id where s.status <> 'dropped')
select 'nz-fibre-content' rule, code style, name, season, 'Sold in New Zealand with no fibre content recorded for the permanent label' detail
  from live where 'NZ' = any(markets) and coalesce(trim(fibre_content), '') = ''
union all
-- Parts are separated by semicolons ("Shell: 100% nylon; Fill: 100% polyester"); each part with percentages must add to 100.
select 'fibre-total', code, name, season, 'Fibre content part "' || trim(p.part) || '" adds to ' || t.total || '%, not 100%'
  from live cross join lateral regexp_split_to_table(fibre_content, ';') p(part)
  cross join lateral (select sum((x[1])::numeric) total from regexp_matches(p.part, '(\d+(?:\.\d+)?)\s*%', 'g') x) t
  where coalesce(trim(fibre_content), '') <> '' and t.total is not null and t.total <> 100
union all
select 'nz-care-english', code, name, season, 'Sold in New Zealand with no care instructions in English (symbols alone do not meet the NZ rule)'
  from live where 'NZ' = any(markets) and coalesce(trim(care_instructions), '') = ''
union all
select 'au-care-label', code, name, season, 'Sold in Australia with no care instructions or care symbols recorded'
  from live where 'AU' = any(markets) and coalesce(trim(care_instructions), '') = '' and coalesce(trim(care_symbols), '') = ''
union all
select 'nightwear-category', code, name, season, 'Children''s nightwear with no fire hazard category (1 to 4) recorded'
  from live where childrens_nightwear and nightwear_category is null
union all
select 'nightwear-label', code, name, season, 'Category ' || nightwear_category || ' needs the ' ||
    case when nightwear_category = 4 then 'high fire danger (red)' else 'low fire hazard (white)' end || ' label; recorded: ' || coalesce(fire_label, 'none')
  from live where childrens_nightwear and nightwear_category is not null
    and coalesce(fire_label, '') <> case when nightwear_category = 4 then 'high' else 'low' end
union all
select 'nightwear-test', code, name, season, 'Children''s nightwear with no burn test report reference on file'
  from live where childrens_nightwear and coalesce(trim(nightwear_test_ref), '') = ''
union all
select 'factory-audit', s.code, s.name, s.season, o.code || ' ex-factory ' || o.ex_factory_on || ' at ' || f.code || ': social audit ' ||
    coalesce('expires ' || f.audit_expires_on, 'not on file')
  from plm.production_orders o join live s on s.id = o.style_id join plm.factories f on f.id = o.factory_id
  where o.status in ('draft','placed','in_production') and (f.audit_expires_on is null or f.audit_expires_on < o.ex_factory_on)
union all
select 'pp-before-bulk', s.code, s.name, s.season, o.code || ' is ' || replace(o.status, '_', ' ') || ' with no approved pre-production sample'
  from plm.production_orders o join live s on s.id = o.style_id
  where o.status in ('in_production','shipped')
    and not exists (select 1 from plm.samples sa where sa.style_id = o.style_id and sa.kind = 'pp' and sa.status = 'approved');
