# Staging deployment runbook

This runbook is mandatory for every staging deployment. Staging must contain only synthetic data.
Never copy production databases, Auth users, storage objects, secrets, or monitoring exports.

## One-time provisioning

- Create a dedicated staging Supabase project. Record its project reference as a non-secret and
  confirm it differs from production.
- Apply migrations to create the private `patient-documents` bucket. Confirm the bucket is not public
  and that signed downloads require the existing application authorization checks.
- Create a dedicated hosting project or custom `staging` environment and attach the approved staging
  domain. Require HTTPS and verify the managed TLS certificate before enabling authentication.
- Set the Supabase Auth site URL to the exact staging HTTPS origin. Allow only
  `<staging-origin>/auth/callback` plus explicitly approved test callbacks; remove localhost and
  preview wildcards from the hosted staging allowlist.
- Configure Storage CORS to allow the exact staging HTTPS origin and required methods/headers only.
  Do not use a wildcard origin with authenticated health-document access.
- Add staging-only OpenAI, LiveKit, notification, Supabase, salt, and monitoring credentials through
  the hosting secret manager. Never paste values into repository files or deployment logs.
- Configure monitoring retention/access and verify that only the strict content-free event schema is
  exported. Alert on readiness degradation, auth/booking/video/notification error increases, AI
  error rate, routing fallback rate, and red-flag evaluation failures.

Vercel custom environments support `vercel deploy --target=staging`; another approved host may be
used, but it must provide equivalent environment isolation, domain/TLS, secret management, and
rollback controls.

## Controlled migration

Provide staging credentials through the shell or CI secret manager. The command links only the
explicit staging project, runs `supabase db push --dry-run`, and applies migrations only if the dry
run succeeds. Its confirmation is bound to the project reference:

```bash
export STAGING_MIGRATION_CONFIRM="APPLY_TO_${NEXT_PUBLIC_SUPABASE_PROJECT_REF}"
npm run migrate:staging
```

The guard requires `APP_ENV=staging`, matching public markers, a matching Supabase HTTPS hostname,
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and a production project reference different from
staging. Do not pass secrets as command arguments.

## Every-deployment smoke checklist

Run the automated public checks immediately after deployment:

```bash
APP_ENV=staging STAGING_BASE_URL=https://staging.example.invalid npm run smoke:staging
```

Then execute and record the following with synthetic accounts:

- [ ] `/health` returns only `{"status":"ok"}` over valid TLS with security/no-store headers.
- [ ] Anonymous access to `/patient`, `/doctor`, and `/admin/health` redirects to sign-in.
- [ ] Staging Auth accepts the exact callback URL and rejects an unlisted redirect origin.
- [ ] Synthetic patient signup, login, onboarding, and logout work without exposing detailed errors.
- [ ] A synthetic patient cannot access another patient's appointment, document, or consultation.
- [ ] A synthetic verified doctor sees only assigned appointments; an unverified doctor is not
      bookable.
- [ ] A synthetic private document upload succeeds for allowed files; direct/public object access and
      cross-origin browser access fail; authorized signed download expires.
- [ ] AI intake succeeds or uses the documented safe fallback. No prompts or patient text appear in
      logs/monitoring.
- [ ] Red-flag input preserves emergency routing and suppresses ordinary interim guidance.
- [ ] Video token issuance succeeds only for an authorized active appointment and uses staging
      LiveKit credentials.
- [ ] `/admin/health` shows database, storage, AI, and video readiness without endpoints or errors.
- [ ] Content-free failure counters and alerts receive a synthetic failure; no identifier, clinical
      content, token, or signed URL is present.
- [ ] Migration version and deployment commit are recorded; rollback owner and decision window are
      confirmed.

Any failed authorization, RLS, private-storage, red-flag, secret, TLS, or migration check blocks
staging acceptance. Roll back the application deployment when safe; never reverse a database
migration by deleting or rewriting protected records.
