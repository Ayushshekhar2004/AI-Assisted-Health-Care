import { z } from 'zod';

export const JSON_BODY_LIMIT_BYTES = 4 * 1024;

export function isSameOriginRequest(
  origin: string | null,
  expectedOrigin: string,
): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}

export function isTrustedSameOriginForm(
  origin: string | null,
  expectedOrigin: string,
  fetchSite: string | null,
  contentType: string | null,
): boolean {
  const normalizedContentType = contentType
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  const isFormContent =
    normalizedContentType === 'application/x-www-form-urlencoded' ||
    normalizedContentType === 'multipart/form-data';

  if (!isFormContent) return false;
  if (isSameOriginRequest(origin, expectedOrigin)) return true;

  return (origin === null || origin === 'null') && fetchSite === 'same-origin';
}

export function isJsonRequest(contentType: string | null): boolean {
  return (
    contentType?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json'
  );
}

export async function readLimitedJson(
  request: Request,
  maximumBytes = JSON_BODY_LIMIT_BYTES,
): Promise<unknown> {
  const declaredLength = z.coerce
    .number()
    .int()
    .nonnegative()
    .safeParse(request.headers.get('content-length'));
  if (declaredLength.success && declaredLength.data > maximumBytes) {
    throw new Error('Request body is too large');
  }

  if (!request.body) return JSON.parse('');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel();
        throw new Error('Request body is too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}
