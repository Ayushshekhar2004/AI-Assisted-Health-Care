# End-to-end testing

The care-journey database test covers the implemented patient-to-doctor workflow in one rolled-back
transaction. It uses only synthetic `.invalid` identities and synthetic clinical placeholders.

Run it against the local Supabase stack:

```sh
npm run test:e2e
```

The test exercises signup provisioning, onboarding and consent, structured intake, deterministic
non-emergency triage, specialty routing, doctor matching, booking, doctor review, video-token
authorization, consultation and prescription finalization, and patient history. AI intake/routing
responses are deterministic provider stubs persisted through the production server-only validation
functions. LiveKit token creation is not called; the test stops at the production database
authorization boundary. The API route's focused test separately verifies that clients cannot choose
room permissions and that the external token issuer can be stubbed.

The transaction is rolled back, so the test does not leave users or clinical records in the local
database.
