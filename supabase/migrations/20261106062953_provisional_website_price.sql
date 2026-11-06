-- Copy the retail price once, in the same insert that reserves the hour.
-- Later edits and previously saved jobs retain their own amounts and VAT modes.
set local lock_timeout = '5s';
create or replace function public.vecta_create_website_provisional()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_job_id uuid; note text; parts_hex text; encoded_parts text; details_hex text; encoded_details text; types text;
begin
 if new.source is distinct from 'Website booking' or new.status is distinct from 'awaiting_review' then return new;end if;
 if new.job_id is not null then raise exception 'A new website request cannot select an existing job';end if;
 select string_agg(case when value ~* '^(service|major service)$' then 'Full Service' else value end,' || ' order by ord)
 into types from jsonb_array_elements_text(new.job_types) with ordinality as x(value,ord);
 note:='Website request ID: '||new.id::text||' || Website booking made: '||new.created_at::text||
  ' || Website requested date: '||new.preferred_date_1::text||' || Website customer notes: '||new.work_required||
  ' || Completion deadline: '||coalesce(new.completion_deadline,'Not provided')||' || Contact preference: '||coalesce(new.contact_preference,'Email');
 -- Use the application's existing URI-encoded parts format, preserving UTF-8.
 if jsonb_typeof(new.gsf_parts)='array' and jsonb_array_length(new.gsf_parts)>0 then
  parts_hex:=encode(convert_to(new.gsf_parts::text,'UTF8'),'hex');
  select string_agg('%'||substr(parts_hex,n,2),'' order by n) into encoded_parts from generate_series(1,length(parts_hex),2) n;
  note:=note||E'\n[[JOB_PARTS_URI:'||encoded_parts||']]';
 end if;
 details_hex:=encode(convert_to(jsonb_build_object('customer_account','Staff','mileage',new.mileage)::text,'UTF8'),'hex');
 select string_agg('%'||substr(details_hex,n,2),'' order by n) into encoded_details from generate_series(1,length(details_hex),2) n;
 note:=note||E'\n[[VECTA_WEB_DETAILS:'||encoded_details||']]';
 insert into public.jobs(booking_date,drop_time,registration,vehicle,work_required,customer_name,customer_phone,customer_email,
   customer_note,technician,ramp,status,job_type,job_colour,estimated_hours,source,card_type,archived,mot_due,amount_quoted,vat_mode)
 values(coalesce(new.confirmed_date,new.preferred_date_1),new.confirmed_time,new.registration,new.vehicle,new.work_required,
   new.customer_name,new.phone,new.email,note,'Alfie','','provisional',coalesce(types,'General'),split_part(coalesce(types,'General'),' || ',1),
   1,'website booking','job',false,new.mot_due,
   case when new.approximate_cost>=0 then new.approximate_cost end,
   case when jsonb_array_length(new.job_types)=1 and upper(trim(new.job_types->>0))='MOT' then 'no_vat' else 'inc_vat' end) returning id into v_job_id;
 update public.website_booking_requests set job_id=v_job_id where id=new.id;
 return new;
end;$$;
