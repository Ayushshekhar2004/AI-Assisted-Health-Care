# Environment and secret management

## Isolation contract

Development, staging, and production must use separate Supabase projects. Each project therefore has
its own Postgres database, Auth tenant, private `patient-documents` bucket, signing keys, and service
credentials. Data, backups, storage objects, and privileged keys must never be copied between these
projects. Production data must never be restored into development or staging.

The application validates `APP_ENV` against `NEXT_PUBLIC_APP_ENV`, the configured Supabase project
reference, project URL, and resource namespace. Development accepts only the loopback Supabase stack
with project marker `local`. Staging and production accept only HTTPS Supabase URLs whose hostname
matches their explicit project reference. The namespace is `<environment>-<project-ref>` and catches
deployment configuration mix-ups; it is not an authorization control.

Reference overlays are in `environments/*.env.example`. They contain placeholders only. Deployment
configuration belongs in the hosting platform and secret manager, never in Git. `.env.local` is only
for an individual developer and remains ignored.

## Ownership and rotation

| Variable                                | Classification                    | Owner                   | Rotation and response                                                                                                               |
| --------------------------------------- | --------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_SECRET_KEY`                   | RLS-bypassing secret              | Security/platform       | Rotate at least every 90 days and immediately after exposure or administrator departure; redeploy, verify, then revoke the old key. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  | Public RLS-constrained identifier | Platform                | Rotate when the project or signing configuration changes; verify Auth and RLS first.                                                |
| `OPENAI_API_KEY`                        | Server-only provider secret       | AI/platform             | Rotate at least every 90 days and after suspected exposure; apply scope and spend limits.                                           |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Server-only video credentials     | Realtime/platform       | Rotate at least every 90 days and after exposure; overlap only for a controlled deploy.                                             |
| Notification credentials                | Server-only delivery credentials  | Communications/platform | Rotate per provider policy and after exposure; verify opt-out and idempotency afterward.                                            |
| `RATE_LIMIT_SALT`                       | Server-only pseudonym salt        | Security                | Rotate during a planned deploy; rotation clears local identity continuity.                                                          |
| `MONITORING_HASH_SALT`                  | Server-only monitoring salt       | Security                | Rotate under an approved monitoring migration; never reuse another salt.                                                            |

Secrets must be injected at runtime, masked in CI, restricted to their owning environment, and
excluded from logs, tickets, screenshots, and health pages. Record rotations without copying values.

## Deployment checklist

1. Provision a new Supabase project and private storage bucket for the target environment; never
   reuse another environment's project.
2. Apply migrations using that environment's controlled deployment identity.
3. Set the environment markers and verify project reference, URL, namespace, and HTTPS site URL.
4. Resolve secrets from the target secret manager and run readiness checks.
5. Test RLS deny cases, private downloads, Auth redirects, and provider boundaries. Promote code and
   migrations—not databases, buckets, users, or clinical records.

## Development utilities

`npm run seed:demo` mutates its fixed synthetic fixture records. It runs only when `APP_ENV` and
`NEXT_PUBLIC_APP_ENV` are `development`, the project marker is `local`, the namespace is
`development-local`, `NODE_ENV` is not production, explicit confirmation is present, and both the
Supabase API and Postgres targets are loopback-only. It also requires exactly one local database
container. Staging and production are denied even if a confirmation variable is forged.

Never run `supabase db reset`, demo seeds, fixture SQL, or direct Docker database commands against a
hosted project. Production retention is a separate reviewed workflow, not a development utility.

The staging deployment procedure and mandatory post-deployment smoke checklist are in
`docs/staging-deployment.md`.
