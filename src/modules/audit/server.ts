import 'server-only';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

import {
  applicationAuditEventSchema,
  auditLookupEventSchema,
  auditLookupQuerySchema,
  type ApplicationAuditEvent,
  type AuditLookupEvent,
} from './validation';

const AUDIT_LOOKUP_PAGE_SIZE = 25;

type AuditLookupRow = Readonly<{
  id: unknown;
  actor_user_id: unknown;
  action: unknown;
  target_type: unknown;
  target_id: unknown;
  outcome: unknown;
  created_at: unknown;
  total_count: unknown;
}>;

export type AuditLookupPage = Readonly<{
  events: AuditLookupEvent[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}>;

export async function recordAuthenticatedAuditEvent(
  input: ApplicationAuditEvent,
): Promise<void> {
  const event = applicationAuditEventSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.rpc('record_authenticated_audit_event', {
    p_action: event.action,
    p_outcome: event.outcome,
    p_target_id: event.targetId,
    p_target_type: event.targetType,
  });
  if (error) throw new Error('Audit event is unavailable');
}

export async function recordOwnLoginRoleAnomaly(): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return;
  await recordAuthenticatedAuditEvent({
    action: 'login_role_resolution_failed',
    targetType: 'auth_user',
    targetId: data.user.id,
    outcome: 'success',
  });
}

export async function recordOwnAdminQueueView(): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Audit event is unavailable');
  await recordAuthenticatedAuditEvent({
    action: 'admin_doctor_verification_queue_viewed',
    targetType: 'admin_area',
    targetId: data.user.id,
    outcome: 'success',
  });
}

export async function listAuditEventsForOperations(
  input: unknown,
): Promise<AuditLookupPage> {
  const query = auditLookupQuerySchema.parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    'list_audit_events_for_operations',
    {
      p_actor_id: query.actorId || null,
      p_category: query.category,
      p_from: query.from ? `${query.from}T00:00:00.000Z` : null,
      p_limit: AUDIT_LOOKUP_PAGE_SIZE,
      p_offset: (query.page - 1) * AUDIT_LOOKUP_PAGE_SIZE,
      p_target_id: query.targetId || null,
      p_to: query.to ? `${query.to}T23:59:59.999Z` : null,
    },
  );
  if (error) throw new Error('Audit lookup is unavailable');
  const rows = (data ?? []) as AuditLookupRow[];
  const events = auditLookupEventSchema.array().parse(
    rows.map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      outcome: row.outcome,
      createdAt: row.created_at,
    })),
  );
  const totalCount = z.coerce
    .number()
    .int()
    .nonnegative()
    .parse(rows[0]?.total_count ?? 0);
  return {
    events,
    page: query.page,
    pageSize: AUDIT_LOOKUP_PAGE_SIZE,
    totalCount,
    totalPages: Math.ceil(totalCount / AUDIT_LOOKUP_PAGE_SIZE),
  };
}
