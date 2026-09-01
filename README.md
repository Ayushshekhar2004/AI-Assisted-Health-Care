# AI-Assisted Health Care

> **Development status:** This project is under active development. It is incomplete, has not been
> clinically validated, and is not ready for production use or real patient data.

This repository is a privacy-first healthcare application prototype built as a Next.js TypeScript
modular monolith with Supabase authentication and persistence.

## Vibe-coded and AI-assisted

This project is intentionally **vibe-coded**: substantial parts of its design, documentation, and
implementation are created with AI-assisted coding workflows under human direction. AI-generated
code can be incomplete, incorrect, or insecure. Every change—especially authentication, database,
privacy, and clinical-safety code—must receive human review and pass the required tests before it is
trusted or merged.

The phrase “AI-assisted” does not mean the application can replace a healthcare professional. The
application must not issue final diagnoses or prescriptions, and it must not be used for emergency
care or medical advice.

## Current foundation

- Next.js App Router with strict TypeScript
- Supabase Auth session handling and role-protected areas
- Row Level Security for patient, doctor, profile, and consent records
- Patient onboarding with separately versioned consent records
- Zod boundary validation and Vitest/pgTAP test scaffolding

## Privacy and safety

- Never use real protected health information (PHI) in development, tests, demonstrations, or AI
  prompts. Use clearly synthetic data only.
- Never log patient messages, symptoms, clinical notes, prescriptions, credentials, tokens, or
  secrets.
- Treat all current behavior as experimental until it has completed security, privacy, clinical, and
  operational review.

Read [AGENTS.md](./AGENTS.md), [architecture](./docs/architecture.md),
[security](./docs/security.md), and [clinical safety](./docs/clinical-safety.md) before contributing.

## Local setup

Requirements:

- Node.js 20 or newer
- npm
- A development Supabase project containing synthetic data only

Copy `.env.example` to `.env.local` and provide the development Supabase URL, publishable key, and
site URL. Never place a Supabase secret or service-role key in a `NEXT_PUBLIC_` variable.

```bash
npm install
npm run dev
```

### Local Ollama text AI

OpenAI remains the default provider. For local development, the intake, specialty-routing, and
consultation-draft workflows can instead use an Ollama model through the server. Install Ollama,
start its local service, and pull a model that supports structured JSON output:

```bash
ollama serve
ollama pull <model-name>
```

Then set these server-only values in `.env.local`:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=<model-name>
```

The application permits loopback or explicit RFC1918 private-LAN Ollama IPs and rejects Ollama
configuration in production. It rejects public hosts, URL credentials, and alternate URL paths.
Model responses must match the existing Zod schemas. LAN Ollama commonly uses unencrypted HTTP, so
use only trusted private networks and synthetic data. Voice transcription still requires the
existing server-side OpenAI Realtime configuration.

To switch back, set `AI_PROVIDER=openai` and configure the existing `OPENAI_*` variables. See the
[Ollama chat API](https://docs.ollama.com/api/chat) and
[structured outputs documentation](https://docs.ollama.com/capabilities/structured-outputs) for the
local API behavior used by this application.

### Development notifications

Set `NOTIFICATION_PROVIDER=development` for local testing. Appointment confirmation, reminder,
cancellation, and doctor-ready transitions create private, content-free delivery events. The
development provider acknowledges due events without contacting an external service and without
logging recipients or notification content. A trusted server scheduler must invoke
`dispatchDueNotificationEvents` for scheduled reminders; no public reminder endpoint is exposed.
The development provider is intentionally rejected in production until an approved delivery
provider and scheduler are configured.

Every event UUID is also the provider idempotency key. Database uniqueness, locked claims, and
five-minute processing leases prevent concurrent jobs from sending the same event. Failures retry at
bounded 1-minute, 5-minute, 30-minute, and 2-hour intervals, with no more than five attempts.
Patients may opt out of appointment reminders; confirmation, cancellation, and doctor-ready notices
remain essential appointment logistics and are not suppressed by that preference.

Before merging changes, run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Database changes must also pass the Supabase migration and pgTAP test workflow before merging.

## License

No license has been granted yet. All rights are reserved unless a license is added to this
repository.
