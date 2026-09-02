begin;

-- Fixed UUIDs keep this development fixture deterministic. All identities and
-- labels are deliberately synthetic and reserved under example.invalid.
delete from public.notification_events
where appointment_id in (
  'de000000-0000-4000-8000-000000000201',
  'de000000-0000-4000-8000-000000000202'
);
delete from public.appointments
where id in (
  'de000000-0000-4000-8000-000000000201',
  'de000000-0000-4000-8000-000000000202'
);
delete from public.doctor_availability
where id in (
  'de000000-0000-4000-8000-000000000101',
  'de000000-0000-4000-8000-000000000102',
  'de000000-0000-4000-8000-000000000103',
  'de000000-0000-4000-8000-000000000104',
  'de000000-0000-4000-8000-000000000105'
);
delete from public.audit_events
where actor_user_id in (
  'de000000-0000-4000-8000-000000000001',
  'de000000-0000-4000-8000-000000000011',
  'de000000-0000-4000-8000-000000000012',
  'de000000-0000-4000-8000-000000000013'
);
delete from auth.users
where id in (
  'de000000-0000-4000-8000-000000000001',
  'de000000-0000-4000-8000-000000000011',
  'de000000-0000-4000-8000-000000000012',
  'de000000-0000-4000-8000-000000000013'
);

insert into auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('de000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','demo.patient@example.invalid','',now(),'{}','{}',now(),now()),
  ('de000000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','demo.general@example.invalid','',now(),'{}','{}',now(),now()),
  ('de000000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','demo.dermatology@example.invalid','',now(),'{}','{}',now(),now()),
  ('de000000-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated','demo.orthopedics@example.invalid','',now(),'{}','{}',now(),now());

delete from public.profiles
where auth_user_id in (
  'de000000-0000-4000-8000-000000000011',
  'de000000-0000-4000-8000-000000000012',
  'de000000-0000-4000-8000-000000000013'
);

update public.profiles
set display_name='Synthetic Demo Patient'
where auth_user_id='de000000-0000-4000-8000-000000000001';
update public.patients
set preferred_language='en',date_of_birth='1990-01-01',gender=null,
  city='Synthetic Demo City',onboarding_completed_at=now()
where profile_id=(select id from public.profiles where auth_user_id='de000000-0000-4000-8000-000000000001');

insert into public.profiles(id,auth_user_id,role,display_name) values
  ('de000000-0000-4000-8000-000000000021','de000000-0000-4000-8000-000000000011','doctor','Dr Synthetic General'),
  ('de000000-0000-4000-8000-000000000022','de000000-0000-4000-8000-000000000012','doctor','Dr Synthetic Dermatology'),
  ('de000000-0000-4000-8000-000000000023','de000000-0000-4000-8000-000000000013','doctor','Dr Synthetic Orthopedics');

insert into public.doctors(
  id,profile_id,status,full_name,qualification,registration_number,
  registration_council,registration_state,specialty,languages,
  teleconsultation_fee_paise,clinic_city,onboarding_completed_at,is_bookable,
  verification_reason,verification_decided_at,verification_decided_by
) values
  ('de000000-0000-4000-8000-000000000031','de000000-0000-4000-8000-000000000021','verified','Dr Synthetic General','Synthetic Medical Qualification','DEMO-GM-001','Synthetic Demo Council','Synthetic State','GENERAL_MEDICINE',array['en','hi']::public.doctor_language[],50000,'Synthetic Demo City',now(),true,'Synthetic fixture approval',now(),'de000000-0000-4000-8000-000000000011'),
  ('de000000-0000-4000-8000-000000000032','de000000-0000-4000-8000-000000000022','verified','Dr Synthetic Dermatology','Synthetic Medical Qualification','DEMO-DERM-001','Synthetic Demo Council','Synthetic State','DERMATOLOGY',array['en']::public.doctor_language[],60000,'Synthetic Demo City',now(),true,'Synthetic fixture approval',now(),'de000000-0000-4000-8000-000000000012'),
  ('de000000-0000-4000-8000-000000000033','de000000-0000-4000-8000-000000000023','verified','Dr Synthetic Orthopedics','Synthetic Medical Qualification','DEMO-ORTHO-001','Synthetic Demo Council','Synthetic State','ORTHOPEDICS',array['en','hi']::public.doctor_language[],65000,'Synthetic Demo City',now(),true,'Synthetic fixture approval',now(),'de000000-0000-4000-8000-000000000013');

insert into public.doctor_availability(id,doctor_id,starts_at,ends_at) values
  ('de000000-0000-4000-8000-000000000101','de000000-0000-4000-8000-000000000031',date_trunc('day',now())+interval '2 days 10 hours',date_trunc('day',now())+interval '2 days 10 hours 30 minutes'),
  ('de000000-0000-4000-8000-000000000102','de000000-0000-4000-8000-000000000031',date_trunc('day',now())+interval '3 days 11 hours',date_trunc('day',now())+interval '3 days 11 hours 30 minutes'),
  ('de000000-0000-4000-8000-000000000103','de000000-0000-4000-8000-000000000032',date_trunc('day',now())+interval '4 days 12 hours',date_trunc('day',now())+interval '4 days 12 hours 30 minutes'),
  ('de000000-0000-4000-8000-000000000104','de000000-0000-4000-8000-000000000033',date_trunc('day',now())+interval '5 days 14 hours',date_trunc('day',now())+interval '5 days 14 hours 30 minutes'),
  ('de000000-0000-4000-8000-000000000105','de000000-0000-4000-8000-000000000033',date_trunc('day',now())+interval '6 days 15 hours',date_trunc('day',now())+interval '6 days 15 hours 30 minutes');

insert into public.appointments(
  id,doctor_availability_id,doctor_id,patient_id,starts_at,ends_at,fee_paise,status
)
select
  fixture.appointment_id,availability.id,availability.doctor_id,patient.id,
  availability.starts_at,availability.ends_at,fixture.fee_paise,fixture.status
from (values
  ('de000000-0000-4000-8000-000000000201'::uuid,'de000000-0000-4000-8000-000000000101'::uuid,50000,'REQUESTED'::public.appointment_status),
  ('de000000-0000-4000-8000-000000000202'::uuid,'de000000-0000-4000-8000-000000000103'::uuid,60000,'CONFIRMED'::public.appointment_status)
) fixture(appointment_id,availability_id,fee_paise,status)
join public.doctor_availability availability on availability.id=fixture.availability_id
cross join lateral (
  select patients.id from public.patients
  join public.profiles on profiles.id=patients.profile_id
  where profiles.auth_user_id='de000000-0000-4000-8000-000000000001'
) patient;

commit;
