export const DEMO_SEED_CONFIRMATION: 'LOCAL_DEMO_ONLY';

type LocalStatus = Readonly<{
  API_URL: string;
  DB_URL: string;
}>;

export function assertLocalDemoSeedTarget(input: {
  confirmation: string | undefined;
  status: unknown;
}): LocalStatus;

export function selectLocalDatabaseContainer(containerNames: string): string;
