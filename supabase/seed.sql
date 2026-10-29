-- Demo data: Southerly Outfitters, a fictional Auckland outdoor and lifestyle label that designs
-- in New Zealand, makes in China, Bangladesh and Vietnam, and sells in New Zealand and Australia.
-- Everything is relative to today, so the attention commands always have something to say.
-- Idempotent: codes and unique keys make a second run a no-op. Never run this on a live database.

insert into plm.seasons (code, name, launch_on, status) values
  ('AW26', 'Autumn Winter 2026', current_date - 245, 'launched'),
  ('AW27', 'Autumn Winter 2027', current_date + 120, 'developing'),
  ('SS27', 'Spring Summer 2027', current_date + 300, 'planning')
on conflict (code) do nothing;

insert into plm.factories (code, name, country, contact, email, speciality, audit_scheme, audit_expires_on, sample_lead_days) values
  ('NBK', 'Ningbo Fine Knit Co.', 'China', 'Lily Zhang', 'lily@ningbofineknit.example', 'Merino and cut-and-sew knits', 'amfori BSCI', current_date + 40, 21),
  ('DHW', 'Dhaka Woven Apparel', 'Bangladesh', 'Rahim Chowdhury', 'rahim@dhakawoven.example', 'Wovens, twill, flannel', 'WRAP', current_date + 400, 21),
  ('HCM', 'Saigon Outerwear', 'Vietnam', 'Minh Tran', 'minh@saigonouterwear.example', 'Technical outerwear and fleece', 'SMETA', current_date + 200, 25),
  ('AKL', 'Auckland Cut and Sew', 'New Zealand', 'Sione Taufa', 'sione@aklcutandsew.example', 'Short runs and samples', null, null, 10)
on conflict (code) do nothing;

insert into plm.materials (code, name, kind, composition, supplier, unit, unit_cost_cents, currency, moq) values
  ('F-MER', 'Merino jersey 200gsm', 'fabric', '100% merino wool', 'Zhejiang Wool Mills', 'm', 1450, 'USD', 2500),
  ('F-RNY', 'Recycled nylon ripstop', 'fabric', '100% recycled nylon', 'Formosa Textile', 'm', 680, 'USD', 1000),
  ('F-COT', 'Organic cotton twill', 'fabric', '98% organic cotton, 2% elastane', 'Arvind Mills', 'm', 420, 'USD', 800),
  ('F-FLC', 'Recycled polyester fleece', 'fabric', '100% recycled polyester', 'Polartec Asia', 'm', 510, 'USD', 600),
  ('F-FLN', 'Brushed cotton flannel', 'fabric', '100% cotton', 'Arvind Mills', 'm', 390, 'USD', 500),
  ('T-INS', 'Synthetic insulation 100g', 'trim', '100% recycled polyester', 'Formosa Textile', 'm', 320, 'USD', 1000),
  ('T-ZIP', 'YKK #5 coil zip', 'trim', null, 'YKK Vietnam', 'pc', 85, 'USD', null),
  ('T-BTN', 'Corozo button 20L', 'trim', null, 'Ningbo Buttons', 'pc', 12, 'USD', null),
  ('L-MAIN', 'Woven main label', 'label', null, 'Avery Dennison', 'pc', 6, 'USD', null),
  ('L-CARE', 'Printed care and content label', 'label', null, 'Avery Dennison', 'pc', 3, 'USD', null),
  ('P-BAG', 'Recycled polybag', 'packaging', null, 'Avery Dennison', 'pc', 4, 'USD', null)
on conflict (code) do nothing;

insert into plm.styles (code, name, season_id, category, department, factory_id, designer, status, retail_cents, target_margin_pct,
  planned_units, size_range, markets, fibre_content, care_instructions, care_symbols, origin, childrens_nightwear, nightwear_category, fire_label, nightwear_test_ref)
select v.code, v.name, se.id, v.category, v.department, f.id, v.designer, v.status, v.retail, v.target, v.units, v.sizes, v.markets::text[],
  v.fibre, v.care, v.symbols, v.origin, v.nightwear, v.cat, v.label, v.testref
from (values
  ('SO-090','Classic Merino Crew','AW26','base layers','unisex','NBK','Hana Kim','in_production',11900,65.0,1500,'XS-XXL','{NZ,AU}','100% merino wool','Cold machine wash, dry flat, do not tumble dry','wash 30, no bleach, dry flat, no tumble','China',false,null::int,null,null),
  ('SO-101','Merino Crew Tee','AW27','base layers','unisex','NBK','Hana Kim','fit',12900,65.0,1200,'XS-XXL','{NZ,AU}','100% merino wool','Cold machine wash, dry flat, do not tumble dry','wash 30, no bleach, dry flat, no tumble','China',false,null,null,null),
  ('SO-102','Merino Zip Neck','AW27','base layers','unisex','NBK','Hana Kim','proto',15900,65.0,800,'XS-XXL','{NZ,AU}','100% merino wool','Cold machine wash, dry flat, do not tumble dry','wash 30, no bleach, dry flat, no tumble','China',false,null,null,null),
  ('SO-201','Ripstop Shell Jacket','AW27','outerwear','unisex','HCM','Tom Reeve','fit',24900,65.0,600,'XS-XXL','{NZ,AU}','100% recycled nylon','Warm machine wash, close zips, line dry, reproof with spray-on DWR','wash 40, no bleach, line dry, no iron','Vietnam',false,null,null,null),
  ('SO-202','Insulated Puffer Vest','AW27','outerwear','unisex','HCM','Tom Reeve','proto',22900,65.0,700,'XS-XXL','{NZ,AU}','Shell: 100% recycled nylon; Fill: 100% recycled polyester','Warm machine wash, tumble dry low with dryer balls','wash 40, tumble low, no iron','Vietnam',false,null,null,null),
  ('SO-301','Organic Twill Trouser','AW27','bottoms','mens','DHW','Ana Lima','fit',17900,65.0,900,'28-38','{NZ,AU}','98% organic cotton, 3% elastane','Warm machine wash inside out, line dry, warm iron','wash 40, line dry, iron medium','Bangladesh',false,null,null,null),
  ('SO-302','Flannel Overshirt','AW27','shirts','unisex','DHW','Ana Lima','proto',14900,65.0,700,'XS-XXL','{NZ,AU}','100% cotton','','wash 40, no bleach, line dry, iron medium','Bangladesh',false,null,null,null),
  ('SO-401','Kids Fleece Pyjama Set','AW27','kids','kids','DHW','Ana Lima','proto',5900,65.0,500,'2-12','{NZ,AU}','100% recycled polyester','Warm machine wash, line dry, keep away from heat and flame','wash 40, line dry','Bangladesh',true,null,null,null),
  ('SO-402','Kids Flannel Pyjamas','AW27','kids','kids','DHW','Ana Lima','proto',5490,65.0,500,'2-12','{NZ,AU}','100% cotton','Warm machine wash, line dry, keep away from heat and flame','wash 40, line dry','Bangladesh',true,2,'high','AWTA 26-11873'),
  ('SO-501','Fleece Half Zip','AW27','midlayers','unisex','HCM','Tom Reeve','in_production',13900,65.0,1800,'XS-XXL','{NZ,AU}','100% recycled polyester','Warm machine wash, line dry, do not iron','wash 40, line dry, no iron','Vietnam',false,null,null,null),
  ('SO-502','Merino Beanie','AW27','accessories','unisex','NBK','Hana Kim','proto',4900,65.0,1000,'One size','{NZ,AU}',null,'Hand wash cold, dry flat','hand wash, dry flat','China',false,null,null,null),
  ('SO-601','Canvas Tote','AW27','accessories','unisex','DHW','Ana Lima','concept',5900,65.0,400,'One size','{AU}','100% organic cotton','','','Bangladesh',false,null,null,null),
  ('SO-701','Waxed Field Jacket','AW27','outerwear','mens','HCM','Tom Reeve','dropped',39900,65.0,0,'S-XXL','{NZ,AU}','100% cotton','Do not wash, sponge clean, rewax yearly','do not wash','Vietnam',false,null,null,null),
  ('SO-801','Linen Camp Shirt','SS27','shirts','mens',null,'Ana Lima','concept',13900,65.0,600,'S-XXL','{NZ,AU}','100% linen','Cool machine wash, line dry, hot iron','wash 30, line dry, iron high','',false,null,null,null),
  ('SO-802','Merino Tank','SS27','base layers','womens','NBK','Hana Kim','concept',8900,65.0,800,'XS-XL','{NZ,AU}','100% merino wool','Cold machine wash, dry flat','wash 30, dry flat','China',false,null,null,null)
) v(code, name, season, category, department, factory, designer, status, retail, target, units, sizes, markets, fibre, care, symbols, origin, nightwear, cat, label, testref)
join plm.seasons se on se.code = v.season left join plm.factories f on f.code = v.factory
on conflict (code) do nothing;

insert into plm.colourways (style_id, code, name, status)
select s.id, v.cw, v.name, v.status from (values
  ('SO-090','BLK','Black','active'),
  ('SO-101','BLK','Black','active'), ('SO-101','KWK','Kawakawa green','active'), ('SO-101','OAT','Oatmeal marle','active'),
  ('SO-102','BLK','Black','active'), ('SO-102','NVY','Navy','active'),
  ('SO-201','STM','Storm grey','active'), ('SO-201','OCH','Ochre','active'),
  ('SO-202','BLK','Black','active'), ('SO-202','MOS','Moss','active'),
  ('SO-301','SND','Sand','active'), ('SO-301','OLV','Olive','active'),
  ('SO-302','RDC','Red check','active'), ('SO-302','BLC','Blue check','active'),
  ('SO-401','NVY','Navy stars','active'), ('SO-402','KIW','Kiwi print','active'),
  ('SO-501','CHR','Charcoal','active'), ('SO-501','TEA','Teal','active'), ('SO-501','CRM','Cream','dropped'),
  ('SO-502','BLK','Black','active'), ('SO-502','KWK','Kawakawa green','active'),
  ('SO-601','NAT','Natural','active')
) v(style, cw, name, status) join plm.styles s on s.code = v.style
on conflict (style_id, code) do nothing;

insert into plm.bom_lines (style_id, material_id, placement, consumption, wastage_pct)
select s.id, m.id, v.placement, v.qty, v.waste from (values
  ('SO-101','F-MER','Body and sleeves',1.10,4.0), ('SO-101','L-MAIN','Back neck',1,1.0), ('SO-101','L-CARE','Left side seam',1,1.0), ('SO-101','P-BAG','Pack',1,1.0),
  ('SO-102','F-MER','Body and sleeves',1.35,4.0), ('SO-102','T-ZIP','Centre front neck',1,2.0), ('SO-102','L-MAIN','Back neck',1,1.0), ('SO-102','L-CARE','Left side seam',1,1.0),
  ('SO-201','F-RNY','Shell',2.40,5.0), ('SO-201','T-ZIP','Centre front',1,2.0), ('SO-201','L-MAIN','Back neck',1,1.0), ('SO-201','L-CARE','Left side seam',1,1.0),
  ('SO-202','F-RNY','Shell and lining',2.10,5.0), ('SO-202','T-INS','Fill',1.10,5.0), ('SO-202','T-ZIP','Centre front',1,2.0), ('SO-202','L-CARE','Left side seam',1,1.0),
  ('SO-301','F-COT','Body',1.45,4.0), ('SO-301','T-BTN','Waistband',1,3.0), ('SO-301','L-MAIN','Back waistband',1,1.0), ('SO-301','L-CARE','Left side seam',1,1.0),
  ('SO-302','F-FLN','Body',2.20,6.0), ('SO-302','T-BTN','Front placket and cuffs',9,3.0), ('SO-302','L-CARE','Left side seam',1,1.0),
  ('SO-401','F-FLC','Top and pant',1.30,5.0), ('SO-401','L-CARE','Left side seam',1,1.0),
  ('SO-402','F-FLN','Top and pant',1.40,6.0), ('SO-402','L-CARE','Left side seam',1,1.0),
  ('SO-501','F-FLC','Body and sleeves',1.60,5.0), ('SO-501','T-ZIP','Half zip',1,2.0), ('SO-501','L-CARE','Left side seam',1,1.0),
  ('SO-502','F-MER','Body',0.25,6.0), ('SO-502','L-MAIN','Cuff',1,1.0)
) v(style, material, placement, qty, waste) join plm.styles s on s.code = v.style join plm.materials m on m.code = v.material
on conflict (style_id, material_id, placement) do nothing;

insert into plm.spec_lines (style_id, pom_code, description, size, spec_cm, tolerance_cm)
select s.id, v.pom, v.descr, v.size, v.cm, v.tol from (values
  ('SO-101','A','Half chest, 2.5 cm below armhole','M',52.0,1.0), ('SO-101','B','Body length from high point shoulder','M',72.0,1.0), ('SO-101','C','Sleeve length from centre back','M',84.0,1.0),
  ('SO-101','A','Half chest, 2.5 cm below armhole','L',55.0,1.0), ('SO-101','B','Body length from high point shoulder','L',74.0,1.0), ('SO-101','C','Sleeve length from centre back','L',86.0,1.0),
  ('SO-201','A','Half chest, 2.5 cm below armhole','M',60.0,1.0), ('SO-201','B','Body length centre back','M',76.0,1.0), ('SO-201','C','Sleeve length from centre back','M',88.0,1.5), ('SO-201','D','Hood opening','M',56.0,1.0),
  ('SO-301','A','Half waist relaxed','32',41.0,0.5), ('SO-301','B','Front rise incl. waistband','32',27.0,0.5), ('SO-301','C','Inside leg','32',81.0,1.0), ('SO-301','D','Half leg opening','32',18.5,0.5)
) v(style, pom, descr, size, cm, tol) join plm.styles s on s.code = v.style
on conflict (style_id, pom_code, size) do nothing;

insert into plm.samples (code, style_id, colourway_id, factory_id, kind, size, requested_on, due_on, received_on, status, decided_on, decided_by, comments)
select v.code, s.id, c.id, f.id, v.kind, v.size, current_date + v.req, current_date + v.due,
  case when v.rec is null then null else current_date + v.rec end, v.status,
  case when v.dec is null then null else current_date + v.dec end, v.by, v.comments
from (values
  -- Last season: the factory history the scorecard reads.
  ('SA-0901','SO-090','BLK','NBK','proto','M',-330,-309,-303,'approved',-300,'Hana Kim',null),
  ('SA-0902','SO-090','BLK','NBK','fit','M',-290,-269,-260,'approved',-258,'Hana Kim','Sleeve 1 cm short, accepted'),
  ('SA-0903','SO-090','BLK','NBK','pp','M',-250,-229,-225,'approved',-224,'Hana Kim',null),
  ('SA-0904','SO-090','BLK','DHW','proto','M',-320,-299,-301,'approved',-298,'Ana Lima','Second source trial'),
  ('SA-0905','SO-090','BLK','DHW','fit','M',-280,-259,-260,'approved',-258,'Ana Lima',null),
  ('SA-0906','SO-090','BLK','HCM','proto','M',-310,-285,-282,'rejected',-280,'Tom Reeve','Hand feel too dry'),
  -- This season.
  ('SA-101','SO-101','BLK','NBK','proto','M',-95,-74,-70,'approved',-68,'Hana Kim','Approved, go to fit'),
  ('SA-102','SO-101','KWK','NBK','fit','M',-40,-19,-12,'received',null,null,null),
  ('SA-103','SO-102','NVY','NBK','proto','M',-60,-39,null,'requested',null,null,null),
  ('SA-201','SO-201','STM','HCM','proto','M',-80,-55,-50,'approved',-49,'Tom Reeve','Approved with hood changes'),
  ('SA-202','SO-201','STM','HCM','fit','M',-30,-9,null,'requested',null,null,null),
  ('SA-203','SO-202','BLK','HCM','proto','M',-70,-49,-40,'approved',-39,'Tom Reeve',null),
  ('SA-301','SO-301','SND','DHW','fit','32',-35,-14,-10,'rejected',-8,'Ana Lima','Waist too big and rise too low. Correct to spec and resubmit.'),
  ('SA-302','SO-301','SND','DHW','fit','32',-8,13,null,'requested',null,null,null),
  ('SA-303','SO-302','RDC','DHW','proto','M',-50,-29,-27,'approved',-26,'Ana Lima',null),
  ('SA-401','SO-401','NVY','DHW','proto','6',-45,-24,-24,'approved',-22,'Ana Lima',null),
  ('SA-501','SO-501','CHR','HCM','proto','M',-50,-29,-20,'approved',-19,'Tom Reeve','Carry-over block, approved'),
  ('SA-502','SO-501','CHR','HCM','pp','M',-10,-2,null,'requested',null,null,null)
) v(code, style, cw, factory, kind, size, req, due, rec, status, dec, by, comments)
join plm.styles s on s.code = v.style join plm.factories f on f.code = v.factory
left join plm.colourways c on c.style_id = s.id and c.code = v.cw
on conflict (code) do nothing;

insert into plm.fit_measurements (sample_id, pom_code, measured_cm)
select sa.id, v.pom, v.cm from (values
  ('SA-102','A',54.5), ('SA-102','B',72.5), ('SA-102','C',83.5),
  ('SA-301','A',42.5), ('SA-301','B',25.8), ('SA-301','C',81.5), ('SA-301','D',18.5)
) v(sample, pom, cm) join plm.samples sa on sa.code = v.sample
on conflict (sample_id, pom_code) do nothing;

insert into plm.approvals (code, style_id, colourway_id, kind, submitted_on, due_on, status, decided_on, decided_by, comments)
select v.code, s.id, c.id, v.kind, current_date + v.sub, current_date + v.due, v.status,
  case when v.dec is null then null else current_date + v.dec end, v.by, v.comments
from (values
  ('AP-101','SO-101','KWK','lab_dip',-20,-6,'pending',null,null,'Three options A, B, C under D65 light'),
  ('AP-201','SO-201','OCH','lab_dip',-15,-1,'resubmit',-3,'Tom Reeve','Too red. Resubmit greener against the Pantone 16-0947 standard.'),
  ('AP-402','SO-402','KIW','strike_off',-5,9,'pending',null,null,null),
  ('AP-501','SO-501','TEA','lab_dip',-40,-26,'approved',-27,'Tom Reeve','Option B'),
  ('AP-502','SO-502','KWK','lab_dip',-12,2,'pending',null,null,'To match SO-101 Kawakawa green')
) v(code, style, cw, kind, sub, due, status, dec, by, comments)
join plm.styles s on s.code = v.style left join plm.colourways c on c.style_id = s.id and c.code = v.cw
on conflict (code) do nothing;

insert into plm.costings (style_id, version, factory_id, fob_cents, fob_currency, fx_rate, freight_cents, duty_pct, quoted_on, status, note)
select s.id, v.ver, f.id, v.fob, 'USD', v.fx, v.freight, v.duty, current_date + v.quoted, v.status, v.note
from (values
  ('SO-090',1,'NBK',1550,1.6500,120,10.0,-280,'agreed',null),
  ('SO-101',1,'NBK',1650,1.7000,120,10.0,-30,'quoted',null),
  ('SO-102',1,'NBK',2100,1.7000,120,10.0,-30,'quoted',null),
  ('SO-201',1,'HCM',4200,1.7000,250,10.0,-60,'superseded','Before hood change'),
  ('SO-201',2,'HCM',4650,1.7000,250,10.0,-20,'quoted','Hood with laminated peak and two-way adjuster'),
  ('SO-202',1,'HCM',3400,1.7000,200,10.0,-35,'quoted',null),
  ('SO-301',1,'DHW',1550,1.7000,120,10.0,-25,'quoted',null),
  ('SO-302',1,'DHW',1480,1.7000,120,10.0,-25,'quoted',null),
  ('SO-401',1,'DHW',1150,1.7000,100,10.0,-20,'quoted',null),
  ('SO-402',1,'DHW',980,1.7000,100,10.0,-20,'quoted',null),
  ('SO-501',1,'HCM',1900,1.7000,150,10.0,-15,'agreed','Carry-over block'),
  ('SO-502',1,'NBK',520,1.7000,40,10.0,-25,'quoted',null)
) v(style, ver, factory, fob, fx, freight, duty, quoted, status, note)
join plm.styles s on s.code = v.style join plm.factories f on f.code = v.factory
on conflict (style_id, version) do nothing;

insert into plm.milestones (style_id, step_code, done_on, done_by)
select s.id, v.step, current_date + v.done, v.by from (values
  ('SO-101','brief',-95,'Hana Kim'), ('SO-101','tech_pack',-62,'Hana Kim'), ('SO-101','proto',-68,'Hana Kim'),
  ('SO-102','brief',-95,'Hana Kim'),
  ('SO-201','brief',-95,'Tom Reeve'), ('SO-201','tech_pack',-60,'Tom Reeve'), ('SO-201','proto',-49,'Tom Reeve'),
  ('SO-202','brief',-95,'Tom Reeve'), ('SO-202','tech_pack',-60,'Tom Reeve'), ('SO-202','proto',-39,'Tom Reeve'),
  ('SO-301','brief',-95,'Ana Lima'), ('SO-301','tech_pack',-64,'Ana Lima'), ('SO-301','proto',-40,'Ana Lima'),
  ('SO-302','brief',-95,'Ana Lima'), ('SO-302','tech_pack',-58,'Ana Lima'), ('SO-302','proto',-26,'Ana Lima'),
  ('SO-401','brief',-95,'Ana Lima'), ('SO-401','tech_pack',-60,'Ana Lima'), ('SO-401','proto',-22,'Ana Lima'),
  ('SO-402','brief',-95,'Ana Lima'), ('SO-402','tech_pack',-55,'Ana Lima'),
  ('SO-501','brief',-120,'Tom Reeve'), ('SO-501','tech_pack',-100,'Tom Reeve'), ('SO-501','proto',-19,'Tom Reeve'),
  ('SO-501','colour',-27,'Tom Reeve'), ('SO-501','costing',-12,'Tom Reeve'), ('SO-501','po',-5,'Tom Reeve'),
  ('SO-502','brief',-95,'Hana Kim'), ('SO-502','tech_pack',-60,'Hana Kim'), ('SO-502','proto',-30,'Hana Kim'),
  ('SO-601','brief',-95,'Ana Lima')
) v(style, step, done, by) join plm.styles s on s.code = v.style
on conflict (style_id, step_code) do nothing;

insert into plm.production_orders (code, style_id, colourway_id, factory_id, units, fob_cents, currency, placed_on, ex_factory_on, status)
select v.code, s.id, c.id, f.id, v.units, v.fob, 'USD', case when v.placed is null then null else current_date + v.placed end, current_date + v.exf, v.status
from (values
  ('PO-2601','SO-090','BLK','NBK',1500,1550,-200,-140,'received'),
  ('PO-2701','SO-501','CHR','HCM',1100,1900,-5,55,'in_production'),
  ('PO-2702','SO-501','TEA','HCM',700,1900,-5,55,'in_production'),
  ('PO-2703','SO-101','BLK','NBK',700,1650,null,85,'draft'),
  ('PO-2704','SO-101','KWK','NBK',500,1650,null,85,'draft'),
  ('PO-2705','SO-301','SND','DHW',900,1550,null,85,'draft')
) v(code, style, cw, factory, units, fob, placed, exf, status)
join plm.styles s on s.code = v.style join plm.factories f on f.code = v.factory
left join plm.colourways c on c.style_id = s.id and c.code = v.cw
on conflict (code) do nothing;

insert into plm.notes (subject_type, subject_id, author, body, created_at)
select v.kind, coalesce(s.id, f.id), v.author, v.body, now() + make_interval(days => v.ago)
from (values
  ('style','SO-201',null,'Tom Reeve','Hood change added USD 4.50 to the FOB. Retail held at 249 for now; review at line freeze.',-20),
  ('style','SO-401',null,'Ana Lima','Waiting on the burn test booking with the lab before the category goes on the label.',-6),
  ('factory',null,'NBK','Hana Kim','Lily confirmed the BSCI re-audit is booked but has not given a date.',-10)
) v(kind, style, factory, author, body, ago)
left join plm.styles s on s.code = v.style left join plm.factories f on f.code = v.factory
where not exists (select 1 from plm.notes n where n.body = v.body);
