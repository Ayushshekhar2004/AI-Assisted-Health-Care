create type public.prescription_status as enum ('DRAFT', 'FINAL');
create type public.prescription_item_type as enum ('MEDICINE', 'TEST', 'INSTRUCTION');

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete restrict,
  consultation_id uuid references public.consultations(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  doctor_id uuid not null references public.doctors(id) on delete restrict,
  doctor_name text not null,
  doctor_registration_number text not null,
  doctor_registration_council text not null,
  doctor_registration_state text not null,
  prescription_date date not null default current_date,
  follow_up text not null default '',
  status public.prescription_status not null default 'DRAFT',
  finalized_at timestamptz,
  finalized_by_doctor_id uuid references public.doctors(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prescriptions_doctor_snapshot_lengths check (
    char_length(btrim(doctor_name)) between 2 and 120
    and char_length(btrim(doctor_registration_number)) between 2 and 80
    and char_length(btrim(doctor_registration_council)) between 2 and 120
    and char_length(btrim(doctor_registration_state)) between 2 and 120
  ),
  constraint prescriptions_follow_up_length check (char_length(follow_up) <= 4000),
  constraint prescriptions_finalization_complete check (
    (status='DRAFT' and finalized_at is null and finalized_by_doctor_id is null)
    or (status='FINAL' and finalized_at is not null and finalized_by_doctor_id=doctor_id and consultation_id is not null)
  )
);

create table public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  item_type public.prescription_item_type not null,
  item_name text not null,
  dosage text not null default '',
  frequency text not null default '',
  duration text not null default '',
  instructions text not null default '',
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prescription_items_name_length check (char_length(btrim(item_name)) between 1 and 500),
  constraint prescription_items_field_lengths check (
    char_length(dosage)<=200 and char_length(frequency)<=200
    and char_length(duration)<=200 and char_length(instructions)<=1000
  ),
  constraint prescription_items_sort_order check (sort_order between 0 and 49),
  constraint prescription_items_unique_order unique(prescription_id,sort_order)
);

create trigger prescriptions_set_updated_at before update on public.prescriptions
for each row execute function public.set_updated_at();
create trigger prescription_items_set_updated_at before update on public.prescription_items
for each row execute function public.set_updated_at();

create function public.prevent_final_prescription_changes() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.status='FINAL' then raise check_violation using message='Final prescription cannot be changed'; end if;
  if (new.appointment_id,new.patient_id,new.doctor_id) is distinct from
     (old.appointment_id,old.patient_id,old.doctor_id)
  then raise check_violation using message='Prescription ownership is immutable'; end if;
  return new;
end; $$;
create trigger prescriptions_prevent_final_changes before update on public.prescriptions
for each row execute function public.prevent_final_prescription_changes();

create function public.prevent_final_prescription_item_changes() returns trigger
language plpgsql set search_path='' as $$
declare target_prescription_id uuid := coalesce(new.prescription_id,old.prescription_id);
begin
  if exists(select 1 from public.prescriptions where id=target_prescription_id and status='FINAL')
  then raise check_violation using message='Final prescription items cannot be changed'; end if;
  return coalesce(new,old);
end; $$;
create trigger prescription_items_prevent_final_changes
before insert or update or delete on public.prescription_items
for each row execute function public.prevent_final_prescription_item_changes();

alter table public.prescriptions enable row level security;
alter table public.prescription_items enable row level security;
revoke all on public.prescriptions,public.prescription_items from anon,authenticated;
grant select on public.prescriptions,public.prescription_items to authenticated;

create policy prescriptions_assigned_doctor_read on public.prescriptions for select to authenticated using (
  exists(select 1 from public.doctors join public.profiles on profiles.id=doctors.profile_id
    where doctors.id=prescriptions.doctor_id and doctors.status='verified'
      and profiles.auth_user_id=(select auth.uid()) and profiles.role='doctor')
);
create policy prescriptions_patient_final_read on public.prescriptions for select to authenticated using (
  status='FINAL' and exists(select 1 from public.patients join public.profiles on profiles.id=patients.profile_id
    where patients.id=prescriptions.patient_id and profiles.auth_user_id=(select auth.uid()) and profiles.role='patient')
);
create policy prescription_items_visible_parent_read on public.prescription_items for select to authenticated using (
  exists(select 1 from public.prescriptions where prescriptions.id=prescription_items.prescription_id)
);

alter table public.audit_events drop constraint audit_events_action_allowed;
alter table public.audit_events add constraint audit_events_action_allowed check(action in (
  'doctor_verification_approved','doctor_verification_rejected','doctor_availability_created','doctor_availability_deleted',
  'appointment_requested','appointment_status_transitioned','intake_session_started','intake_message_added',
  'intake_patient_message_added','intake_assistant_turn_recorded','triage_no_red_flag_recorded','triage_red_flag_detected',
  'triage_emergency_pathway_entered','specialty_routing_recorded','doctor_match_searched','intake_voice_session_issued',
  'doctor_dashboard_viewed','doctor_appointment_detail_viewed','doctor_appointment_transcript_viewed',
  'doctor_handoff_source_accessed','doctor_handoff_generated','doctor_handoff_viewed','doctor_handoff_marked_inaccurate',
  'appointment_video_token_issued','consultation_draft_saved','consultation_finalized','consultation_viewed',
  'consultation_ai_source_accessed','consultation_ai_draft_generated','prescription_draft_saved',
  'prescription_finalized','prescription_viewed'
));

create function public.write_prescription(
  p_appointment_id uuid,p_follow_up text,p_items jsonb,p_finalize boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  user_id uuid := (select auth.uid()); actor_doctor public.doctors%rowtype;
  selected_appointment public.appointments%rowtype; finalized_consultation_id uuid;
  v_prescription_id uuid; item jsonb; item_index integer:=0;
begin
  select doctors.* into actor_doctor from public.doctors join public.profiles on profiles.id=doctors.profile_id
  where profiles.auth_user_id=user_id and profiles.role='doctor' and doctors.status='verified';
  select * into selected_appointment from public.appointments where id=p_appointment_id for update;
  if actor_doctor.id is null or not found or selected_appointment.doctor_id<>actor_doctor.id
    or selected_appointment.status not in ('IN_PROGRESS','COMPLETED','REQUIRES_IN_PERSON')
  then raise insufficient_privilege using message='Prescription is unavailable'; end if;
  if actor_doctor.full_name is null or actor_doctor.registration_number is null
    or actor_doctor.registration_council is null or actor_doctor.registration_state is null
  then raise check_violation using message='Doctor registration is incomplete'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>50
    or char_length(coalesce(p_follow_up,''))>4000
  then raise check_violation using message='Prescription content is invalid'; end if;
  if p_finalize and jsonb_array_length(p_items)=0
  then raise check_violation using message='Final prescription requires an entry'; end if;
  if p_finalize then
    select id into finalized_consultation_id from public.consultations
    where appointment_id=p_appointment_id and status='FINALIZED' and finalized_by_doctor_id=actor_doctor.id;
    if finalized_consultation_id is null then
      raise insufficient_privilege using message='Prescription cannot be finalized';
    end if;
  end if;

  insert into public.prescriptions(appointment_id,consultation_id,patient_id,doctor_id,doctor_name,
    doctor_registration_number,doctor_registration_council,doctor_registration_state,follow_up)
  values(selected_appointment.id,finalized_consultation_id,selected_appointment.patient_id,actor_doctor.id,
    actor_doctor.full_name,actor_doctor.registration_number,actor_doctor.registration_council,
    actor_doctor.registration_state,coalesce(p_follow_up,''))
  on conflict(appointment_id) do update set follow_up=excluded.follow_up,
    consultation_id=coalesce(excluded.consultation_id,prescriptions.consultation_id)
  where prescriptions.status='DRAFT' returning id into v_prescription_id;
  if v_prescription_id is null then raise invalid_parameter_value using message='Prescription is unavailable'; end if;

  delete from public.prescription_items where prescription_items.prescription_id=v_prescription_id;
  for item in select value from jsonb_array_elements(p_items) loop
    if item ?| array['id','prescription_id','status','finalized_at','doctor_id','patient_id']
      or not item ?& array['item_type','item_name','dosage','frequency','duration','instructions']
      or exists(select 1 from jsonb_object_keys(item) as item_key
        where item_key not in ('item_type','item_name','dosage','frequency','duration','instructions'))
      or jsonb_typeof(item->'item_type')<>'string' or jsonb_typeof(item->'item_name')<>'string'
      or jsonb_typeof(item->'dosage')<>'string' or jsonb_typeof(item->'frequency')<>'string'
      or jsonb_typeof(item->'duration')<>'string' or jsonb_typeof(item->'instructions')<>'string'
      or item->>'item_type' not in ('MEDICINE','TEST','INSTRUCTION')
      or char_length(btrim(coalesce(item->>'item_name',''))) not between 1 and 500
      or char_length(coalesce(item->>'dosage',''))>200 or char_length(coalesce(item->>'frequency',''))>200
      or char_length(coalesce(item->>'duration',''))>200 or char_length(coalesce(item->>'instructions',''))>1000
    then raise check_violation using message='Prescription item is invalid'; end if;
    insert into public.prescription_items(prescription_id,item_type,item_name,dosage,frequency,duration,instructions,sort_order)
    values(v_prescription_id,(item->>'item_type')::public.prescription_item_type,btrim(item->>'item_name'),
      btrim(item->>'dosage'),btrim(item->>'frequency'),btrim(item->>'duration'),btrim(item->>'instructions'),item_index);
    item_index:=item_index+1;
  end loop;
  if p_finalize then update public.prescriptions set status='FINAL',finalized_at=now(),
    finalized_by_doctor_id=actor_doctor.id,prescription_date=current_date where id=v_prescription_id; end if;
  insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
  values(user_id,case when p_finalize then 'prescription_finalized' else 'prescription_draft_saved' end,
    'appointment',p_appointment_id,'success');
  return v_prescription_id;
end; $$;

create function public.get_own_prescription(p_appointment_id uuid)
returns table(prescription_data jsonb,items_data jsonb)
language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); selected_prescription public.prescriptions%rowtype;
begin
  select prescriptions.* into selected_prescription from public.prescriptions
  join public.doctors on doctors.id=prescriptions.doctor_id
  join public.profiles doctor_profile on doctor_profile.id=doctors.profile_id
  join public.patients on patients.id=prescriptions.patient_id
  join public.profiles patient_profile on patient_profile.id=patients.profile_id
  where prescriptions.appointment_id=p_appointment_id and (
    (doctor_profile.auth_user_id=user_id and doctors.status='verified')
    or (patient_profile.auth_user_id=user_id and prescriptions.status='FINAL'));
  if not found then return; end if;
  insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
  values(user_id,'prescription_viewed','appointment',p_appointment_id,'success');
  return query select to_jsonb(selected_prescription),coalesce((select jsonb_agg(to_jsonb(items) order by sort_order)
    from public.prescription_items items where items.prescription_id=selected_prescription.id),'[]'::jsonb);
end; $$;

revoke execute on function public.write_prescription(uuid,text,jsonb,boolean) from public,anon;
grant execute on function public.write_prescription(uuid,text,jsonb,boolean) to authenticated;
revoke execute on function public.get_own_prescription(uuid) from public,anon;
grant execute on function public.get_own_prescription(uuid) to authenticated;
revoke execute on function public.prevent_final_prescription_changes(),public.prevent_final_prescription_item_changes() from public,anon,authenticated;

comment on table public.prescriptions is 'Doctor-controlled prescriptions. Drafts are doctor-only; only explicit doctor finalization shares with the patient.';
