import 'server-only';

import { writeSecurityLog } from '../../lib/security/logging';
import {
  operationalMetricSchema,
  RecentFailureCounter,
  type OperationalMetric,
  type OperationalMonitoringProvider,
} from './monitoring';

const recentFailures = new RecentFailureCounter();

class StructuredLogMonitoringProvider implements OperationalMonitoringProvider {
  record(metric: OperationalMetric): void {
    recentFailures.add(metric);
    const { event, ...fields } = metric;
    writeSecurityLog(event, fields);
  }
}

const provider = new StructuredLogMonitoringProvider();

export function recordOperationalMetric(input: unknown): void {
  provider.record(operationalMetricSchema.parse(input));
}

export function getRecentFailureCounts() {
  return recentFailures.counts();
}

export async function tryHashMonitoringIdentifier(
  identifier: string,
): Promise<string | undefined> {
  try {
    const { hashMonitoringIdentifier } = await import('./monitoring');
    return await hashMonitoringIdentifier(identifier);
  } catch {
    return undefined;
  }
}
