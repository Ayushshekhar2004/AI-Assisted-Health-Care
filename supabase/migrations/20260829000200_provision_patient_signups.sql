create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_profile_id uuid;
begin
  insert into public.profiles (auth_user_id, role)
  values (new.id, 'patient')
  returning id into new_profile_id;

  insert into public.patients (profile_id)
  values (new_profile_id);

  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger provision_patient_after_auth_signup
after insert on auth.users
for each row execute function public.handle_new_auth_user();

comment on function public.handle_new_auth_user() is
  'Provisions email sign-ups as patients. Doctor and operations roles require trusted server provisioning.';
