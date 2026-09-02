import { describe, expect, it, vi } from 'vitest';

const loadDoubles = vi.hoisted(() => ({
  createUserClient: vi.fn(),
  createRoleAuthorizedClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: loadDoubles.createUserClient,
}));
vi.mock('@/modules/auth', () => ({
  createRoleAuthorizedClient: loadDoubles.createRoleAuthorizedClient,
}));
vi.mock('@/modules/audit', () => ({
  recordOwnAdminQueueView: vi.fn(),
}));
vi.mock('@/modules/monitoring/server', () => ({
  recordOperationalMetric: vi.fn(),
  tryHashMonitoringIdentifier: vi.fn().mockResolvedValue('synthetic-hash'),
}));
vi.mock('@/modules/notification/server', () => ({
  dispatchNotificationEventsForAppointment: vi.fn(),
}));

import { resolveCurrentRole } from '@/modules/auth/session';
import { findMatchingDoctors } from '@/modules/doctor/server';
import {
  orchestrateIntake,
  type IntakeModel,
} from '@/modules/intake/orchestrator';
import { bookAvailability } from '@/modules/scheduling/server';

import {
  findFirstBottleneck,
  runLoadScenario,
  type LoadScenario,
} from './load-harness';

const LOAD_TESTS_ENABLED = process.env.RUN_LOCAL_LOAD_TESTS === 'true';
const SYNTHETIC_USER_ID = '10000000-0000-4000-8000-000000000001';

const scenarios = [
  {
    name: 'auth-session-check',
    iterations: 250,
    concurrency: 50,
    budget: { p95Milliseconds: 40, maximumErrorRate: 0 },
  },
  {
    name: 'doctor-discovery',
    iterations: 150,
    concurrency: 30,
    budget: { p95Milliseconds: 80, maximumErrorRate: 0 },
  },
  {
    name: 'slot-booking',
    iterations: 150,
    concurrency: 30,
    budget: { p95Milliseconds: 80, maximumErrorRate: 0 },
  },
  {
    name: 'ai-intake',
    iterations: 80,
    concurrency: 20,
    budget: { p95Milliseconds: 180, maximumErrorRate: 0 },
  },
] as const satisfies readonly LoadScenario[];

describe.runIf(LOAD_TESTS_ENABLED)('local healthcare load baseline', () => {
  it('meets the initial budgets and reports the first constrained boundary', async () => {
    const authClient = createAuthClient();
    const doctorClient = createDoctorDiscoveryClient();
    const bookingClient = createBookingClient();
    const intakeModel = new ConcurrencyLimitedIntakeModel(4, 20);

    loadDoubles.createUserClient.mockReturnValue(doctorClient);
    loadDoubles.createRoleAuthorizedClient.mockResolvedValue({
      supabase: bookingClient,
      userId: SYNTHETIC_USER_ID,
      role: 'patient',
    });

    const results = [];
    results.push(
      await runLoadScenario(scenarios[0], async () => {
        expect(await resolveCurrentRole(authClient as never)).toBe('patient');
      }),
    );
    results.push(
      await runLoadScenario(scenarios[1], async () => {
        const matches = await findMatchingDoctors({
          consultationMode: 'TELECONSULTATION',
          availableFrom: '2030-01-01T00:00:00.000Z',
          availableUntil: '2030-01-08T00:00:00.000Z',
        });
        expect(matches).toHaveLength(5);
      }),
    );
    results.push(
      await runLoadScenario(scenarios[2], async (iteration) => {
        await bookAvailability(syntheticUuid(20_000 + iteration));
      }),
    );
    results.push(
      await runLoadScenario(scenarios[3], async () => {
        const result = await orchestrateIntake(intakeModel, {
          messages: [],
          previousStructured: null,
        });
        expect(result.intakeComplete).toBe(false);
      }),
    );

    const bottleneck = findFirstBottleneck(scenarios, results);
    process.stdout.write(
      `${JSON.stringify({
        kind: 'local-load-baseline',
        externalProviders: 'mocked',
        results: results.map((result) => ({
          ...result,
          durationMilliseconds: rounded(result.durationMilliseconds),
          requestsPerSecond: rounded(result.requestsPerSecond),
          p50Milliseconds: rounded(result.p50Milliseconds),
          p95Milliseconds: rounded(result.p95Milliseconds),
          p99Milliseconds: rounded(result.p99Milliseconds),
        })),
        firstBottleneck: bottleneck.name,
      })}\n`,
    );

    expect(results.every((result) => result.passed)).toBe(true);
    expect(bottleneck.name).toBe('ai-intake');
    expect(intakeModel.peakInFlight).toBe(4);
  });
});

function createAuthClient() {
  return {
    auth: {
      getUser: async () => {
        await delay(2);
        return { data: { user: { id: SYNTHETIC_USER_ID } }, error: null };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            await delay(2);
            return { data: { role: 'patient' }, error: null };
          },
        }),
      }),
    }),
  };
}

function createDoctorDiscoveryClient() {
  return {
    auth: {
      getUser: async () => {
        await delay(2);
        return { data: { user: { id: SYNTHETIC_USER_ID } }, error: null };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            await delay(2);
            return { data: { role: 'patient' }, error: null };
          },
        }),
      }),
    }),
    rpc: async () => {
      await delay(6);
      return { data: syntheticDoctorRows(), error: null };
    },
  };
}

function createBookingClient() {
  return {
    rpc: async () => {
      await delay(8);
      return { data: null, error: null };
    },
  };
}

class ConcurrencyLimitedIntakeModel implements IntakeModel {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  peakInFlight = 0;

  constructor(
    private readonly limit: number,
    private readonly latencyMilliseconds: number,
  ) {}

  async generate(): Promise<unknown> {
    await this.acquire();
    try {
      await delay(this.latencyMilliseconds);
      return {
        chief_complaint: null,
        onset: null,
        duration: null,
        severity: null,
        associated_symptoms: [],
        relevant_history: [],
        current_medicines: [],
        allergies: [],
        pregnancy_possibility: {
          clinically_relevant: false,
          response: 'not_clinically_relevant',
        },
        missing_information: ['chief_complaint'],
        follow_up_question: 'What is the main health concern?',
        intake_complete: false,
      };
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;
    this.peakInFlight = Math.max(this.peakInFlight, this.active);
  }

  private release(): void {
    this.active -= 1;
    this.waiters.shift()?.();
  }
}

function syntheticDoctorRows() {
  return Array.from({ length: 5 }, (_, doctorIndex) => ({
    doctor_id: syntheticUuid(doctorIndex + 1),
    doctor_name: `Synthetic Doctor ${doctorIndex + 1}`,
    qualification: 'Synthetic Qualification',
    registration_number: `SYN-${doctorIndex + 1}`,
    specialty: 'GENERAL_MEDICINE',
    consultation_languages: ['en', 'hi'],
    fee_paise: 50_000,
    clinic_city: 'Synthetic City',
    consultation_mode: 'TELECONSULTATION',
    routing_decision_source: 'DETERMINISTIC_FALLBACK',
    next_slots: Array.from({ length: 3 }, (_, slotIndex) => ({
      id: syntheticUuid(1_000 + doctorIndex * 10 + slotIndex),
      startsAt: `2030-01-0${slotIndex + 2}T10:00:00.000Z`,
      endsAt: `2030-01-0${slotIndex + 2}T10:30:00.000Z`,
    })),
  }));
}

function syntheticUuid(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
}

function rounded(value: number): number {
  return Number(value.toFixed(2));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
