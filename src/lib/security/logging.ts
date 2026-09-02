const sensitiveKeyPattern =
  /(authorization|cookie|token|secret|password|message|symptom|diagnosis|prescription|prompt|response|note|attachment|signed.?url)/i;
const allowedLogKeys = new Set([
  'category',
  'correlationId',
  'durationMs',
  'method',
  'outcome',
  'path',
  'retryAfterSeconds',
  'status',
]);

export type SafeLogValue = string | number | boolean | null;

export function redactLogFields(
  fields: Readonly<Record<string, unknown>>,
): Record<string, SafeLogValue> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => {
      if (sensitiveKeyPattern.test(key) || !allowedLogKeys.has(key)) {
        return [key, '[REDACTED]'];
      }
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        value === null
      ) {
        return [key, value];
      }
      return [key, '[REDACTED]'];
    }),
  );
}

export function writeSecurityLog(
  event: string,
  fields: Readonly<Record<string, unknown>> = {},
): void {
  const safeEvent = /^[a-z][a-z0-9_.-]{0,79}$/.test(event)
    ? event
    : 'invalid_security_event';
  console.info(
    JSON.stringify({ event: safeEvent, ...redactLogFields(fields) }),
  );
}
