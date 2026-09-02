# Local load testing

The initial load suite exercises existing auth/session, doctor-discovery, slot-booking, and AI-intake
boundaries with clearly synthetic identifiers. It is intentionally local and uses injected database
and AI doubles. It does not call Supabase, OpenAI, Ollama, LiveKit, or another hosted provider.

Run it with:

```bash
npm run test:load
```

The command prints aggregate operational measurements only. It does not print request bodies,
symptoms, prescriptions, credentials, tokens, or model prompts. The suite fails if a scenario exceeds
its p95 latency or error-rate budget.

## Initial budgets

| Scenario           | Iterations | Concurrency | p95 budget | Maximum error rate |
| ------------------ | ---------: | ----------: | ---------: | -----------------: |
| Auth/session check |        250 |          50 |      40 ms |                 0% |
| Doctor discovery   |        150 |          30 |      80 ms |                 0% |
| Slot booking       |        150 |          30 |      80 ms |                 0% |
| AI intake          |         80 |          20 |     180 ms |                 0% |

These are development budgets for detecting local regressions, not production service-level
objectives. The database doubles model small I/O delays. The AI double models a provider capacity of
four concurrent generations with 20 ms deterministic service time, allowing provider queueing to be
tested without sending traffic to an external model.

## Baseline and first bottleneck

Baseline run on 3 September 2026:

| Scenario           | Observed p95 |               Throughput |
| ------------------ | -----------: | -----------------------: |
| Auth/session check |      5.72 ms | 9,470.41 requests/second |
| Doctor discovery   |     24.69 ms | 1,799.66 requests/second |
| Slot booking       |      9.87 ms | 3,272.65 requests/second |
| AI intake          |    106.28 ms |   190.15 requests/second |

All initial budgets passed with zero errors. AI intake is the first constrained boundary: its mocked
provider concurrency limit creates a queue and consumes the largest share of its latency budget.
This identifies provider capacity/queueing as the first area to measure in staging. It does not claim
that a real AI provider will match the synthetic latency.

Before setting production budgets, run an approved, low-volume staging test against the isolated
staging database. Any external AI/video test must stay within provider terms and configured rate
limits; use provider mocks for routine concurrency testing. Never load-test production or use real
patient/doctor data.
