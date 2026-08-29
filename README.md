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
