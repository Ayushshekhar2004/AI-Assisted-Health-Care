import { z } from 'zod';

export const readinessServiceSchema = z.enum([
  'database',
  'storage',
  'ai',
  'video',
]);

export const serviceReadinessSchema = z
  .object({
    service: readinessServiceSchema,
    status: z.enum(['READY', 'DEGRADED', 'UNCONFIGURED']),
    latencyMs: z.number().int().nonnegative().max(60_000),
    checkedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const readinessReportSchema = z
  .object({
    status: z.enum(['READY', 'DEGRADED']),
    checkedAt: z.string().datetime({ offset: true }),
    services: z.array(serviceReadinessSchema).length(4),
  })
  .strict();

export type ReadinessService = z.infer<typeof readinessServiceSchema>;
export type ServiceReadiness = z.infer<typeof serviceReadinessSchema>;
export type ReadinessReport = z.infer<typeof readinessReportSchema>;
export type ReadinessProbe = () => Promise<'READY' | 'UNCONFIGURED'>;

export async function collectReadiness(
  probes: Readonly<Record<ReadinessService, ReadinessProbe>>,
  now: () => number = Date.now,
): Promise<ReadinessReport> {
  const services = await Promise.all(
    readinessServiceSchema.options.map(async (service) => {
      const startedAt = now();
      let status: ServiceReadiness['status'];
      try {
        status = await probes[service]();
      } catch {
        status = 'DEGRADED';
      }
      return serviceReadinessSchema.parse({
        service,
        status,
        latencyMs: Math.max(0, now() - startedAt),
        checkedAt: new Date(now()).toISOString(),
      });
    }),
  );
  const checkedAt = new Date(now()).toISOString();
  return readinessReportSchema.parse({
    status: services.every(({ status }) => status === 'READY')
      ? 'READY'
      : 'DEGRADED',
    checkedAt,
    services,
  });
}
