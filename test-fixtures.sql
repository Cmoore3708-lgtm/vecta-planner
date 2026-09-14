begin;

do $$
begin
  if not exists (
    select 1 from public.workshop_settings
    where id = 'test_environment'
      and value->>'synthetic_only' = 'true'
      and value->>'production_data' = 'false'
  ) then
    raise exception 'Safety stop: target is not marked as the synthetic VECTA test environment';
  end if;
end $$;

truncate table
  public.invoice_lines,
  public.invoices,
  public.job_parts,
  public.additional_work_approvals,
  public.service_records,
  public.mot_history,
  public.service_reminders,
  public.website_booking_requests,
  public.mechanic_time_off,
  public.workshop_push_subscriptions,
  public.jobs,
  public.vehicles,
  public.customers,
  public.tasks,
  public.notes,
  public.workshop_settings
restart identity cascade;

insert into public.workshop_settings (id,value) values
('test_environment', '{"synthetic_only":true,"production_data":false,"label":"PUBLIC SYNTHETIC TEST DATA","fixture_version":2}'::jsonb),
('workshop_settings', '{"mechanics":["Alfie","Other"],"ramps":["Left","Middle","Right"],"labourRate":40,"workdayStart":"08:00","workdayEnd":"16:00","testMode":true}'::jsonb),
('fleet_mot_authority_v260', '{"synthetic_only":true,"checkedAt":"2026-09-10T12:00:00Z","source":"fixture"}'::jsonb),
('fleet_state_v77', jsonb_build_object(
  'version', 77,
  'updated_at', '2026-09-10T12:00:00Z',
  'customers', '{}'::jsonb,
  'removedMaintenance', '{}'::jsonb,
  'deletedRegistrations', jsonb_build_array('TST26 OLD'),
  'vehicles', jsonb_build_array(
    jsonb_build_object('id','fv-001','registration','TST26 INT','assetNo','TEST-I01','model','Nissan Qashqai','customer','NMUK Test','department','Internal Test','fleetGroup','NMUK Internal','roadGoing',false,'billingMethod','Month End','status','active','source','synthetic'),
    jsonb_build_object('id','fv-002','registration','TST26 IN2','assetNo','TEST-I02','model','Nissan Juke','customer','NMUK Test','department','Internal Test','fleetGroup','NMUK Internal','roadGoing',false,'billingMethod','Month End','status','active','source','synthetic'),
    jsonb_build_object('id','fv-003','registration','TST26 POL','assetNo','TEST-P01','model','Nissan Ariya','customer','NMUK Test','department','Pool Test','fleetGroup','Pool','roadGoing',true,'billingMethod','Month End','status','active','source','synthetic'),
    jsonb_build_object('id','fv-004','registration','TST26 PO2','assetNo','TEST-P02','model','Nissan Leaf','customer','NMUK Test','department','Pool Test','fleetGroup','Pool','roadGoing',true,'billingMethod','Month End','status','active','source','synthetic'),
    jsonb_build_object('id','fv-005','registration','TST26 NLA','assetNo','NL-TEST-01','model','Ford Transit','customer','Northstar Logistics Test','department','Transport','fleetGroup','Contractor','roadGoing',true,'billingMethod','30 Days','status','active','source','synthetic','contactEmail','accounts@northstar.example.invalid'),
    jsonb_build_object('id','fv-006','registration','TST26 NLB','assetNo','NL-TEST-02','model','Vauxhall Vivaro','customer','Northstar Logistics Test','department','Transport','fleetGroup','Contractor','roadGoing',true,'billingMethod','30 Days','status','active','source','synthetic'),
    jsonb_build_object('id','fv-007','registration','TST26 BSA','assetNo','BS-TEST-01','model','Toyota Proace','customer','Beacon Security Test','department','Security','fleetGroup','Contractor','roadGoing',true,'billingMethod','30 Days','status','active','source','synthetic','contactEmail','accounts@beacon.example.invalid'),
    jsonb_build_object('id','fv-008','registration','TST26 BSB','assetNo','BS-TEST-02','model','Peugeot Partner','customer','Beacon Security Test','department','Security','fleetGroup','Contractor','roadGoing',true,'billingMethod','30 Days','status','active','source','synthetic'),
    jsonb_build_object('id','fv-009','registration','TST26 MVA','assetNo','MVOS-T01','model','Nissan Townstar','customer','NMUK Test','department','MVOS Test','fleetGroup','NMUK MVOS','roadGoing',true,'billingMethod','Month End','status','active','source','synthetic'),
    jsonb_build_object('id','fv-010','registration','TST26 MVB','assetNo','MVOS-T02','model','Nissan Primastar','customer','NMUK Test','department','MVOS Test','fleetGroup','NMUK MVOS','roadGoing',true,'billingMethod','Month End','status','active','source','synthetic'),
    jsonb_build_object('id','fv-011','registration','TST26 DUE','assetNo','TEST-DUE','model','Nissan X-Trail','customer','NMUK Test','department','Pool Test','fleetGroup','Pool','roadGoing',true,'billingMethod','Month End','status','active','source','synthetic'),
    jsonb_build_object('id','fv-012','registration','TST26 OVD','assetNo','TEST-OVER','model','Renault Trafic','customer','Northstar Logistics Test','department','Transport','fleetGroup','Contractor','roadGoing',true,'billingMethod','30 Days','status','active','source','synthetic')
  ),
  'plans', jsonb_build_array(
    jsonb_build_object('id','fp-001','vehicleId','fv-001','type','On-site Service','currentDueDate','2026-09-10','manualDueDate','2026-09-10','intervalMonths',12,'status','due','source','synthetic'),
    jsonb_build_object('id','fp-002','vehicleId','fv-001','type','6 Month Safety Check','currentDueDate','2027-03-10','manualDueDate','2027-03-10','intervalMonths',6,'status','scheduled','source','synthetic'),
    jsonb_build_object('id','fp-003','vehicleId','fv-002','type','On-site Service','currentDueDate','2026-10-02','manualDueDate','2026-10-02','intervalMonths',12,'status','upcoming','source','synthetic'),
    jsonb_build_object('id','fp-004','vehicleId','fv-003','type','MOT','currentDueDate','2026-09-18','manualDueDate','2026-09-18','intervalMonths',12,'status','due','source','synthetic'),
    jsonb_build_object('id','fp-005','vehicleId','fv-003','type','Vehicle Tax','currentDueDate','2026-09-25','manualDueDate','2026-09-25','intervalMonths',12,'status','due','source','synthetic'),
    jsonb_build_object('id','fp-006','vehicleId','fv-004','type','Full Service','currentDueDate','2026-11-01','manualDueDate','2026-11-01','intervalMonths',12,'status','upcoming','source','synthetic'),
    jsonb_build_object('id','fp-007','vehicleId','fv-005','type','Full Service','currentDueDate','2026-09-15','manualDueDate','2026-09-15','intervalMonths',12,'status','scheduled','source','synthetic'),
    jsonb_build_object('id','fp-008','vehicleId','fv-006','type','MOT','currentDueDate','2026-10-05','manualDueDate','2026-10-05','intervalMonths',12,'status','upcoming','source','synthetic'),
    jsonb_build_object('id','fp-009','vehicleId','fv-007','type','Major Service','currentDueDate','2026-09-12','manualDueDate','2026-09-12','intervalMonths',12,'status','due','source','synthetic'),
    jsonb_build_object('id','fp-010','vehicleId','fv-008','type','MOT','currentDueDate','2026-09-08','manualDueDate','2026-09-08','intervalMonths',12,'status','overdue','source','synthetic'),
    jsonb_build_object('id','fp-011','vehicleId','fv-009','type','On-site Service','currentDueDate','2026-09-21','manualDueDate','2026-09-21','intervalMonths',12,'status','scheduled','source','synthetic'),
    jsonb_build_object('id','fp-012','vehicleId','fv-010','type','6 Month Safety Check','currentDueDate','2026-09-30','manualDueDate','2026-09-30','intervalMonths',6,'status','upcoming','source','synthetic'),
    jsonb_build_object('id','fp-013','vehicleId','fv-011','type','Vehicle Tax','currentDueDate','2026-09-10','manualDueDate','2026-09-10','intervalMonths',12,'status','due','source','synthetic'),
    jsonb_build_object('id','fp-014','vehicleId','fv-012','type','Full Service','currentDueDate','2026-08-28','manualDueDate','2026-08-28','intervalMonths',12,'status','overdue','source','synthetic')
  ),
  'completions', jsonb_build_array(
    jsonb_build_object('id','fc-001','vehicleId','fv-001','planId','fp-001','type','On-site Service','serviceType','On-site Service','completedDate','2025-09-10','completedMonth','2025-09','nextDue','2026-09-10','source','synthetic'),
    jsonb_build_object('id','fc-002','vehicleId','fv-003','planId','fp-004','type','MOT','completedDate','2025-09-18','completedMonth','2025-09','nextDue','2026-09-18','source','synthetic'),
    jsonb_build_object('id','fc-003','vehicleId','fv-005','planId','fp-007','type','Major Service','serviceType','Major Service','completedDate','2025-09-15','completedMonth','2025-09','nextDue','2026-09-15','nextServiceType','Full Service','source','synthetic'),
    jsonb_build_object('id','fc-004','vehicleId','fv-007','planId','fp-009','type','Full Service','serviceType','Full Service','completedDate','2025-09-12','completedMonth','2025-09','nextDue','2026-09-12','nextServiceType','Major Service','source','synthetic'),
    jsonb_build_object('id','fc-005','vehicleId','fv-011','planId','fp-013','type','Vehicle Tax','completedDate','2025-09-10','completedMonth','2025-09','nextDue','2026-09-10','source','synthetic')
  )
));

insert into public.customers (id,name,phone,email,notes) values
('10000000-0000-4000-8000-000000000001','Alice Example (Staff)','07000 000101','alice.staff@example.invalid','SYNTHETIC TEST DATA'),
('10000000-0000-4000-8000-000000000002','Ben Example (Staff)','07000 000102','ben.staff@example.invalid','SYNTHETIC TEST DATA'),
('10000000-0000-4000-8000-000000000003','Cara Example (Staff)','07000 000103','cara.staff@example.invalid','SYNTHETIC TEST DATA'),
('10000000-0000-4000-8000-000000000004','Northstar Logistics Test','07000 000201','accounts@northstar.example.invalid','SYNTHETIC CONTRACTOR'),
('10000000-0000-4000-8000-000000000005','Beacon Security Test','07000 000202','accounts@beacon.example.invalid','SYNTHETIC CONTRACTOR'),
('10000000-0000-4000-8000-000000000006','NMUK Test Account',null,'nmuk-test@example.invalid','SYNTHETIC FLEET'),
('10000000-0000-4000-8000-000000000007','Web Booking Example','07000 000301','web.booking@example.invalid','SYNTHETIC WEBSITE CUSTOMER'),
('10000000-0000-4000-8000-000000000008','Deleted Customer Fixture','07000 000999','deleted@example.invalid','SYNTHETIC DELETION FIXTURE');

insert into public.vehicles (id,registration,customer_id,vehicle,make,model,year,fuel_type,engine_size,colour,mileage,mot_due,tax_due,mot_status,latest_mot_mileage,notes) values
('20000000-0000-4000-8000-000000000001','TST26 AAA','10000000-0000-4000-8000-000000000001','Nissan Qashqai','NISSAN','QASHQAI','2022','Petrol','1332','Blue',24150,'2026-11-20','2027-02-01','Valid','22100','SYNTHETIC TEST DATA'),
('20000000-0000-4000-8000-000000000002','TST26 BBB','10000000-0000-4000-8000-000000000002','Ford Fiesta','FORD','FIESTA','2019','Petrol','999','Red',41800,'2026-09-28','2026-12-01','Valid','40500','SYNTHETIC TEST DATA'),
('20000000-0000-4000-8000-000000000003','TST26 CCC','10000000-0000-4000-8000-000000000003','Volkswagen Golf','VOLKSWAGEN','GOLF','2020','Diesel','1968','Black',55200,'2026-09-12','2027-01-01','Valid','53300','SYNTHETIC TEST DATA'),
('20000000-0000-4000-8000-000000000004','TST26 NLA','10000000-0000-4000-8000-000000000004','Ford Transit','FORD','TRANSIT','2021','Diesel','1995','White',80200,'2026-10-15','2026-11-01','Valid','77600','SYNTHETIC CONTRACTOR'),
('20000000-0000-4000-8000-000000000005','TST26 NLB','10000000-0000-4000-8000-000000000004','Vauxhall Vivaro','VAUXHALL','VIVARO','2020','Diesel','1499','White',91300,'2026-10-05','2027-03-01','Valid','88900','SYNTHETIC CONTRACTOR'),
('20000000-0000-4000-8000-000000000006','TST26 BSA','10000000-0000-4000-8000-000000000005','Toyota Proace','TOYOTA','PROACE','2022','Diesel','1499','Silver',60300,'2026-09-30','2027-04-01','Valid','58900','SYNTHETIC CONTRACTOR'),
('20000000-0000-4000-8000-000000000007','TST26 INT','10000000-0000-4000-8000-000000000006','Nissan Qashqai Internal','NISSAN','QASHQAI','2024','Petrol','1332','Grey',8500,null,null,null,null,'SYNTHETIC NMUK INTERNAL'),
('20000000-0000-4000-8000-000000000008','TST26 POL','10000000-0000-4000-8000-000000000006','Nissan Ariya Pool','NISSAN','ARIYA','2023','Electric',null,'Black',19200,'2026-09-18','2026-09-25','Valid','17700','SYNTHETIC NMUK POOL'),
('20000000-0000-4000-8000-000000000009','TST26 MVA','10000000-0000-4000-8000-000000000006','Nissan Townstar MVOS','NISSAN','TOWNSTAR','2023','Electric',null,'White',11000,'2027-02-02','2027-02-01','Valid','9600','SYNTHETIC NMUK MVOS'),
('20000000-0000-4000-8000-000000000010','TST26 WEB','10000000-0000-4000-8000-000000000007','Mini Cooper','MINI','COOPER','2018','Petrol','1499','Green',48700,'2026-10-10','2027-01-01','Valid','46600','SYNTHETIC WEBSITE VEHICLE');

insert into public.jobs (id,booking_date,registration,vehicle,work_required,customer_name,customer_phone,customer_email,customer_note,drop_time,technician,ramp,status,job_type,estimated_hours,source,sort_order,archived,amount_quoted,vat_mode,job_colour,make,model,customer_id,vehicle_id,completed_at) values
('30000000-0000-4000-8000-000000000001','2026-09-10','TST26 AAA','Nissan Qashqai','Full service and health check','Alice Example (Staff)','07000 000101','alice.staff@example.invalid','SYNTHETIC TEST DATA','08:00','Alfie','Left','booked','Full Service',2.5,'manual',1,false,240,'inc_vat','Service','NISSAN','QASHQAI','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null),
('30000000-0000-4000-8000-000000000002','2026-09-10','TST26 BBB','Ford Fiesta','MOT test','Ben Example (Staff)','07000 000102','ben.staff@example.invalid','SYNTHETIC TEST DATA','08:30','Other','Middle','booked','MOT',1,'manual',2,false,54.85,'inc_vat','MOT','FORD','FIESTA','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',null),
('30000000-0000-4000-8000-000000000003','2026-09-10','TST26 CCC','Volkswagen Golf','Replace front brake discs and pads','Cara Example (Staff)','07000 000103','cara.staff@example.invalid','SYNTHETIC TEST DATA','11:00','Alfie','Right','in_progress','Brakes',2,'manual',3,false,320,'inc_vat','Brakes','VOLKSWAGEN','GOLF','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003',null),
('30000000-0000-4000-8000-000000000004','2026-09-10','TST26 NLA','Ford Transit','Investigate engine warning light','Northstar Logistics Test','07000 000201','accounts@northstar.example.invalid','SYNTHETIC CONTRACTOR','13:00','Unallocated',null,'booked','Diagnostics',1.5,'manual',4,false,120,'ex_vat','Diagnostics','FORD','TRANSIT','10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004',null),
('30000000-0000-4000-8000-000000000005','2026-09-10','TST26 BSA','Toyota Proace','Await customer approval for additional work','Beacon Security Test','07000 000202','accounts@beacon.example.invalid','SYNTHETIC CONTRACTOR','14:00','Waiting',null,'booked','General',1,'manual',5,false,180,'ex_vat','General','TOYOTA','PROACE','10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000006',null),
('30000000-0000-4000-8000-000000000006','2026-09-11','TST26 POL','Nissan Ariya Pool','MOT and Full Service','NMUK Test Account',null,'nmuk-test@example.invalid','SYNTHETIC NMUK POOL','08:00','Alfie','Left','booked','MOT, Full Service',3,'manual',1,false,210,'ex_vat','Service','NISSAN','ARIYA','10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000008',null),
('30000000-0000-4000-8000-000000000007','2026-09-11','TST26 INT','Nissan Qashqai Internal','On-site service','NMUK Test Account',null,'nmuk-test@example.invalid','SYNTHETIC NMUK INTERNAL','09:00','Other','Middle','booked','On-site Service',2,'manual',2,false,80,'ex_vat','Service','NISSAN','QASHQAI','10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000007',null),
('30000000-0000-4000-8000-000000000008','2026-09-11','TST26 MVA','Nissan Townstar MVOS','6 Month Safety Check','NMUK Test Account',null,'nmuk-test@example.invalid','SYNTHETIC NMUK MVOS','11:30','Other','Right','booked','6 Month Safety Check',1,'manual',3,false,40,'ex_vat','Service','NISSAN','TOWNSTAR','10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000009',null),
('30000000-0000-4000-8000-000000000009','2026-09-14','TST26 NLB','Vauxhall Vivaro','Major service','Northstar Logistics Test','07000 000201','accounts@northstar.example.invalid','SYNTHETIC CONTRACTOR','08:00','Alfie','Left','booked','Major Service',3,'manual',1,false,360,'ex_vat','Service','VAUXHALL','VIVARO','10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000005',null),
('30000000-0000-4000-8000-000000000010','2026-09-15','TST26 WEB','Mini Cooper','Website request: tyres and tracking','Web Booking Example','07000 000301','web.booking@example.invalid','SYNTHETIC WEBSITE CUSTOMER','10:00','Unallocated',null,'booked','Tyres',2,'website booking',1,false,280,'inc_vat','Tyres','MINI','COOPER','10000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000010',null),
('30000000-0000-4000-8000-000000000011','2026-09-09','TST26 AAA','Nissan Qashqai','Oil and filter change completed','Alice Example (Staff)','07000 000101','alice.staff@example.invalid','SYNTHETIC READY TO INVOICE','09:00','Alfie','Left','ready_to_invoice','Oil & Filter Change',1,'manual',1,false,120,'inc_vat','Service','NISSAN','QASHQAI','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-09-09T10:00:00Z'),
('30000000-0000-4000-8000-000000000012','2026-09-09','TST26 BBB','Ford Fiesta','MOT repairs completed','Ben Example (Staff)','07000 000102','ben.staff@example.invalid','SYNTHETIC READY TO INVOICE','10:00','Other','Middle','ready_to_invoice','Repairs',1.5,'manual',2,false,195,'inc_vat','General','FORD','FIESTA','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','2026-09-09T12:00:00Z'),
('30000000-0000-4000-8000-000000000013','2026-08-04','TST26 CCC','Volkswagen Golf','Air conditioning service','Cara Example (Staff)','07000 000103','cara.staff@example.invalid','SYNTHETIC INVOICED','08:30','Alfie','Left','completed','Air Conditioning',1,'manual',1,true,90,'inc_vat','General','VOLKSWAGEN','GOLF','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','2026-08-04T10:00:00Z'),
('30000000-0000-4000-8000-000000000014','2026-08-12','TST26 NLA','Ford Transit','Full service','Northstar Logistics Test','07000 000201','accounts@northstar.example.invalid','SYNTHETIC CONTRACTOR INVOICED','08:00','Other','Middle','completed','Full Service',3,'manual',1,true,300,'ex_vat','Service','FORD','TRANSIT','10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','2026-08-12T14:00:00Z'),
('30000000-0000-4000-8000-000000000015','2026-08-18','TST26 INT','Nissan Qashqai Internal','Wash and hoover','NMUK Test Account',null,'nmuk-test@example.invalid','SYNTHETIC NMUK MONTH END','09:00','Alfie',null,'completed','Wash & Hoover',0.5,'manual',1,true,20,'ex_vat','General','NISSAN','QASHQAI','10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000007','2026-08-18T09:30:00Z'),
('30000000-0000-4000-8000-000000000016','2026-08-19','TST26 MVA','Nissan Townstar MVOS','Brake inspection and repair','NMUK Test Account',null,'nmuk-test@example.invalid','SYNTHETIC NMUK MVOS MONTH END','10:00','Other','Right','completed','Brakes',2,'manual',1,true,140,'ex_vat','Brakes','NISSAN','TOWNSTAR','10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000009','2026-08-19T13:00:00Z'),
('30000000-0000-4000-8000-000000000017','2026-08-25','TST26 POL','Nissan Ariya Pool','Vehicle Tax','NMUK Test Account',null,'nmuk-test@example.invalid','SYNTHETIC VEHICLE TAX','08:00','Other',null,'completed','Vehicle Tax',0.5,'manual',1,true,360,'no_vat','General','NISSAN','ARIYA','10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000008','2026-08-25T08:30:00Z'),
('30000000-0000-4000-8000-000000000018','2026-07-16','TST26 AAA','Nissan Qashqai','Front tyres','Alice Example (Staff)','07000 000101','alice.staff@example.invalid','SYNTHETIC PAID CARD','09:00','Alfie','Left','completed','Tyres',1,'manual',1,true,240,'inc_vat','Tyres','NISSAN','QASHQAI','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-07-16T11:00:00Z'),
('30000000-0000-4000-8000-000000000019','2026-07-20','TST26 BBB','Ford Fiesta','Battery replacement','Ben Example (Staff)','07000 000102','ben.staff@example.invalid','SYNTHETIC PAID CASH','11:00','Other','Middle','completed','Repairs',1,'manual',1,true,150,'inc_vat','General','FORD','FIESTA','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','2026-07-20T12:30:00Z'),
('30000000-0000-4000-8000-000000000020','2026-06-10','TST26 CCC','Volkswagen Golf','Diagnostic investigation','Cara Example (Staff)','07000 000103','cara.staff@example.invalid','SYNTHETIC VOID INVOICE','13:00','Alfie','Right','completed','Diagnostics',1,'manual',1,true,80,'inc_vat','Diagnostics','VOLKSWAGEN','GOLF','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','2026-06-10T14:00:00Z'),
('30000000-0000-4000-8000-000000000021','2026-09-08','TST26 DEL','Deleted Test Vehicle','Deleted job fixture','Deleted Customer Fixture','07000 000999','deleted@example.invalid','SYNTHETIC DELETED JOB','15:00','Unallocated',null,'deleted','General',1,'website booking',1,true,999,'inc_vat','General',null,null,'10000000-0000-4000-8000-000000000008',null,'2026-09-08T15:30:00Z');

insert into public.invoices (id,job_id,registration,invoice_number,amount,invoice_date,status,customer_name,customer_phone,vehicle,lines,subtotal,vat,total,customer_address,eom_month,fleet_customer,fleet_job_ids,fleet_month,mileage,mot_due,payment_method,source) values
('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000013','TST26 CCC','TEST-1001',90,'2026-08-04','saved','Cara Example (Staff)','07000 000103','Volkswagen Golf','[{"type":"Work","description":"Air conditioning service","qty":1,"amount":90,"vat_mode":"inc_vat"}]',75,15,90,null,null,null,'[]',null,'55200','2026-09-12','card','synthetic'),
('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000014','TST26 NLA','TEST-1002',360,'2026-08-31','saved','Northstar Logistics Test','07000 000201','Ford Transit','[{"type":"Work","description":"Full service","qty":1,"amount":300,"vat_mode":"ex_vat"}]',300,60,360,'1 Fictional Way, Test Industrial Estate, TS1 1AA','2026-08','Northstar Logistics Test','["30000000-0000-4000-8000-000000000014"]','2026-08','80200','2026-10-15','bacs','fleet_month_end'),
('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000015',null,'TEST-1003',24,'2026-08-31','saved','NMUK Test Account',null,'Nissan Qashqai Internal','[{"type":"Work","description":"TST26 INT - Wash and hoover","qty":1,"amount":20,"vat_mode":"ex_vat"}]',20,4,24,'Test Plant, Fictional Road, Sunderland, SR1 1AA','2026-08','NMUK Test Account','["30000000-0000-4000-8000-000000000015"]','2026-08',null,null,'bacs','fleet_month_end'),
('40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000016',null,'TEST-1004',168,'2026-08-31','saved','NMUK Test Account',null,'Nissan Townstar MVOS','[{"type":"Work","description":"TST26 MVA - Brake inspection and repair","qty":1,"amount":140,"vat_mode":"ex_vat"}]',140,28,168,'Test Plant, Fictional Road, Sunderland, SR1 1AA','2026-08','NMUK Test Account','["30000000-0000-4000-8000-000000000016"]','2026-08',null,null,'bacs','fleet_month_end'),
('40000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000017',null,'TEST-1005',360,'2026-08-31','saved','NMUK Test Account',null,'Nissan Ariya Pool','[{"type":"Vehicle Tax","description":"Vehicle Tax - TST26 POL","qty":1,"amount":360,"vat_mode":"no_vat"}]',360,0,360,'Test Plant, Fictional Road, Sunderland, SR1 1AA','2026-08','NMUK Test Account','["30000000-0000-4000-8000-000000000017"]','2026-08',null,null,'bacs','vehicle_tax'),
('40000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000018','TST26 AAA','TEST-1006',240,'2026-07-16','saved','Alice Example (Staff)','07000 000101','Nissan Qashqai','[{"type":"Parts","description":"Two front tyres","qty":2,"amount":240,"vat_mode":"inc_vat"}]',200,40,240,null,null,null,'[]',null,'24150','2026-11-20','card','synthetic'),
('40000000-0000-4000-8000-000000000007','30000000-0000-4000-8000-000000000019','TST26 BBB','TEST-1007',150,'2026-07-20','saved','Ben Example (Staff)','07000 000102','Ford Fiesta','[{"type":"Parts","description":"Battery replacement","qty":1,"amount":150,"vat_mode":"inc_vat"}]',125,25,150,null,null,null,'[]',null,'41800','2026-09-28','cash','synthetic'),
('40000000-0000-4000-8000-000000000008','30000000-0000-4000-8000-000000000020','TST26 CCC','TEST-1008',80,'2026-06-10','void','Cara Example (Staff)','07000 000103','Volkswagen Golf','[{"type":"Work","description":"Voided diagnostic invoice","qty":1,"amount":80,"vat_mode":"inc_vat"}]',66.6666666667,13.3333333333,80,null,null,null,'[]',null,'55200','2026-09-12',null,'synthetic');

insert into public.invoice_lines (invoice_id,type,description,qty,unit_price,amount,vat_mode,sort_order) values
('40000000-0000-4000-8000-000000000001','Work','Air conditioning service',1,90,90,'inc_vat',1),
('40000000-0000-4000-8000-000000000002','Work','Full service',1,300,300,'ex_vat',1),
('40000000-0000-4000-8000-000000000003','Work','TST26 INT - Wash and hoover',1,20,20,'ex_vat',1),
('40000000-0000-4000-8000-000000000004','Work','TST26 MVA - Brake inspection and repair',1,140,140,'ex_vat',1),
('40000000-0000-4000-8000-000000000005','Vehicle Tax','Vehicle Tax - TST26 POL',1,360,360,'no_vat',1),
('40000000-0000-4000-8000-000000000006','Parts','Two front tyres',2,120,240,'inc_vat',1),
('40000000-0000-4000-8000-000000000007','Parts','Battery replacement',1,150,150,'inc_vat',1),
('40000000-0000-4000-8000-000000000008','Work','Voided diagnostic invoice',1,80,80,'inc_vat',1);

insert into public.tasks (task_text,priority,done,sort_order) values
('Test: order brake pads for TST26 CCC','high',false,1),
('Test: call Northstar about diagnostic approval','normal',false,2),
('Test: verify September month-end totals','normal',false,3),
('Test: completed workshop safety check','low',true,4);

insert into public.notes (note_text) values
('SYNTHETIC TEST ENVIRONMENT — no real customer or workshop records.'),
('Use registrations beginning TST26 for all manual tests.');

insert into public.website_booking_requests (id,customer_name,email,phone,registration,vehicle,mileage,job_types,work_required,preferred_date_1,preferred_date_2,completion_deadline,contact_preference,source,status,confirmed_date,confirmed_at,approximate_cost,job_id,mot_due) values
('50000000-0000-4000-8000-000000000001','Web Booking Example','web.booking@example.invalid','07000 000301','TST26 WEB','Mini Cooper','48700','["Tyres","Tracking"]','Two front tyres and wheel alignment','2026-09-15','2026-09-16','End of day','Email','Website booking','awaiting_review',null,null,280,null,'2026-10-10'),
('50000000-0000-4000-8000-000000000002','Daniel Demo','daniel.demo@example.invalid','07000 000302','TST26 W02','Kia Sportage','31000','["Full Service","MOT"]','Full service and MOT','2026-09-18','2026-09-21','End of day','Phone','Website booking','awaiting_review',null,null,260,null,'2026-09-25'),
('50000000-0000-4000-8000-000000000003','Eva Example','eva.example@example.invalid','07000 000303','TST26 W03','Hyundai i20','22000','["Diagnostics"]','Intermittent engine warning light','2026-09-22',null,'No deadline','Email','Website booking','confirmed','2026-09-22','2026-09-10T11:00:00Z',90,null,'2027-01-15'),
('50000000-0000-4000-8000-000000000004','Removed Booking Fixture','removed@example.invalid','07000 000304','TST26 W04','Skoda Fabia','15000','["MOT"]','Deleted website request fixture','2026-09-24',null,null,'Email','Website booking','deleted',null,null,54.85,null,'2026-10-01');

insert into public.service_reminders (registration,reminder_date,reminder_type,completed) values
('TST26 AAA','2026-10-10','service',false),
('TST26 BBB','2026-09-20','MOT',false),
('TST26 CCC','2026-09-01','service',true);

insert into public.mot_history (registration,test_date,expiry_date,result,mileage,advisories,failures) values
('TST26 AAA','2025-11-20','2026-11-20','PASS',22100,'Monitor front tyre wear',null),
('TST26 BBB','2025-09-28','2026-09-28','PASS',40500,'Nearside rear tyre worn close to limit',null),
('TST26 CCC','2025-09-12','2026-09-12','FAIL',53300,null,'Offside stop lamp not working'),
('TST26 CCC','2025-09-13','2026-09-12','PASS',53310,null,null);

insert into public.service_records (id,job_id,registration,service_date,service_type,checks,notes,technician,data) values
('60000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000014','TST26 NLA','2026-08-12','Full Service','{"oil":"green","brakes":"amber","tyres":"green"}','Synthetic completed service','Other','{"synthetic":true,"mileage":80200}'),
('60000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000018','TST26 AAA','2026-07-16','Tyre Check','{"frontTyres":"replaced","rearTyres":"green"}','Synthetic tyre inspection','Alfie','{"synthetic":true,"mileage":24150}');

insert into public.job_parts (job_id,description,quantity,ordered,arrived,ordered_at,arrived_at) values
('30000000-0000-4000-8000-000000000001','Service kit',1,true,true,'2026-09-07T09:00:00Z','2026-09-09T11:00:00Z'),
('30000000-0000-4000-8000-000000000003','Front brake discs',2,true,false,'2026-09-09T09:00:00Z',null),
('30000000-0000-4000-8000-000000000003','Front brake pad set',1,true,true,'2026-09-09T09:00:00Z','2026-09-10T08:00:00Z'),
('30000000-0000-4000-8000-000000000009','Major service kit',1,false,false,null,null),
('30000000-0000-4000-8000-000000000010','Budget 205/45 R17 tyre',2,false,false,null,null);

insert into public.additional_work_approvals (id,token,job_id,registration,vehicle,customer_name,customer_email,customer_phone,items,total,status,created_at,expires_at) values
('70000000-0000-4000-8000-000000000001','synthetic-approval-token','30000000-0000-4000-8000-000000000005','TST26 BSA','Toyota Proace','Beacon Security Test','accounts@beacon.example.invalid','07000 000202','[{"description":"Replace auxiliary belt","amount":180}]',180,'pending','2026-09-10T10:00:00Z','2026-09-17T10:00:00Z');

insert into public.mechanic_time_off (mechanic,start_date,end_date,start_time,end_time,reason) values
('Other','2026-09-17','2026-09-17','13:00','16:00','Synthetic training fixture');

commit;
