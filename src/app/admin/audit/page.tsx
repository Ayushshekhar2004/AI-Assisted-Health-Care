import Link from 'next/link';

import { LocalDateTime } from '@/app/_components/local-date-time';
import {
  auditLookupQuerySchema,
  listAuditEventsForOperations,
} from '@/modules/audit';

type PageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function one(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

const categories = [
  'ALL',
  'AUTH',
  'CONSENT',
  'ADMIN',
  'RECORD_ACCESS',
  'DOCUMENT_ACCESS',
  'CLINICAL_FINALIZATION',
  'APPOINTMENT',
] as const;

function pageHref(
  query: {
    category: string;
    actorId: string;
    targetId: string;
    from: string;
    to: string;
  },
  page: number,
): string {
  const params = new URLSearchParams({
    category: query.category,
    page: String(page),
  });
  if (query.actorId) params.set('actorId', query.actorId);
  if (query.targetId) params.set('targetId', query.targetId);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  return `/admin/audit?${params.toString()}`;
}

export default async function AdminAuditPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const parsed = auditLookupQuerySchema.safeParse({
    category: one(raw.category) || 'ALL',
    actorId: one(raw.actorId),
    targetId: one(raw.targetId),
    from: one(raw.from),
    to: one(raw.to),
    page: one(raw.page) || '1',
  });
  if (!parsed.success) {
    return (
      <main>
        <h1>Audit lookup</h1>
        <p>Review the lookup filters and try again.</p>
      </main>
    );
  }
  try {
    const result = await listAuditEventsForOperations(parsed.data);
    return (
      <main>
        <h1>Audit lookup</h1>
        <p>
          Read-only, content-free security events. Clinical content is never
          shown.
        </p>
        <form className="consultation-mode-form">
          <label>
            Category
            <select name="category" defaultValue={parsed.data.category}>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            Actor UUID
            <input name="actorId" defaultValue={parsed.data.actorId} />
          </label>
          <label>
            Target UUID
            <input name="targetId" defaultValue={parsed.data.targetId} />
          </label>
          <label>
            From
            <input name="from" type="date" defaultValue={parsed.data.from} />
          </label>
          <label>
            To
            <input name="to" type="date" defaultValue={parsed.data.to} />
          </label>
          <button type="submit">Search audit events</button>
        </form>
        <p>{result.totalCount} matching events.</p>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Target</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {result.events.map((event) => (
              <tr key={event.id}>
                <td>
                  <LocalDateTime startsAt={event.createdAt} />
                </td>
                <td>{event.action}</td>
                <td>{event.actorUserId}</td>
                <td>
                  {event.targetType}: {event.targetId}
                </td>
                <td>{event.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <nav aria-label="Audit pages">
          {result.page > 1 ? (
            <Link href={pageHref(parsed.data, result.page - 1)}>Previous</Link>
          ) : null}{' '}
          {result.page < result.totalPages ? (
            <Link href={pageHref(parsed.data, result.page + 1)}>Next</Link>
          ) : null}
        </nav>
        <p>
          <Link href="/admin">Back to operations area</Link>
        </p>
      </main>
    );
  } catch {
    return (
      <main>
        <h1>Audit lookup</h1>
        <p>Audit events are unavailable.</p>
      </main>
    );
  }
}
