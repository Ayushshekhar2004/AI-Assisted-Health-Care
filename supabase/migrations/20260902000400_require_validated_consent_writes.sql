revoke insert on table public.consent_records from authenticated;
drop policy if exists "Patients can add their own consent records" on public.consent_records;

comment on table public.consent_records is
  'Append-only purpose decisions. Authenticated writes must use the version-validated consent RPC; direct browser inserts are denied.';
